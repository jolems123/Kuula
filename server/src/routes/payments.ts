import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook } from "../lib/marzpay.js";
import { writeAuditEvent } from "../lib/audit.js";
import { postSettlementJournal } from "../lib/ledger.js";

const router = Router();

function attemptsArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

router.post("/marzpay/webhook", async (req: Request, res: Response) => {
  // Final events reaching this handler have already been independently fetched
  // from MarZPay's authenticated transaction-details API by the provider
  // verification middleware. The inbound callback body itself is never a money
  // settlement authority.
  const event = parseMarzPayWebhook(req.body);
  if (!event.reference) {
    res.status(400).json({ error: "Webhook transaction reference is required" });
    return;
  }

  const ledger = await prisma.transaction.findUnique({ where: { reference: event.reference } });
  if (!ledger) {
    res.status(404).json({ error: "Unknown transaction reference" });
    return;
  }
  if (ledger.provider !== "marzpay") {
    res.status(409).json({ error: "Transaction provider mismatch" });
    return;
  }

  // Informational callbacks never change authoritative provider identity or
  // financial state. Final settlement waits for the authenticated lookup.
  if (!event.isFinal) {
    res.json({ received: true, pending: true });
    return;
  }

  if (!ledger.transactionId || !event.uuid || event.uuid !== ledger.transactionId) {
    await prisma.transaction.update({
      where: { id: ledger.id },
      data: { reconciliationStatus: "reconciliation_required" },
    });
    res.status(409).json({ error: "Provider transaction identifier mismatch" });
    return;
  }
  if (event.amount === null || event.amount !== Number(ledger.amount)) {
    await prisma.transaction.update({
      where: { id: ledger.id },
      data: {
        providerAmount: event.amount === null ? null : BigInt(event.amount),
        providerCurrency: "UGX",
        reconciliationStatus: "reconciliation_required",
        providerPayload: event.payload as Prisma.InputJsonValue,
      },
    });
    res.status(409).json({ error: "Provider amount does not match the expected transaction amount" });
    return;
  }

  const settled = await prisma.$transaction(async (tx) => {
    const claim = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: event.isSuccess ? "completed" : "failed",
        providerStatus: event.status,
        transactionId: event.uuid,
        providerPayload: event.payload as Prisma.InputJsonValue,
        providerAmount: BigInt(event.amount!),
        providerCurrency: "UGX",
        reconciliationStatus: event.isSuccess ? "matched" : "provider_failed_verified",
        reconciledAt: new Date(),
      },
    });
    if (claim.count !== 1) return false;

    if (event.isSuccess) await postSettlementJournal(tx, ledger);

    if (ledger.type === "loan_disbursement") {
      if (!ledger.loanId) throw new Error("Disbursement ledger is missing loanId");
      const application = await tx.loanApplication.findFirst({
        where: { applicantId: ledger.userId, loanId: ledger.loanId },
      });
      if (!application) throw new Error("Loan application for disbursement was not found");

      if (event.isSuccess) {
        const dueDate = new Date(Date.now() + application.termDays * 86_400_000);
        const existingRepayment = await tx.repayment.findFirst({ where: { userId: ledger.userId, loanId: ledger.loanId } });
        if (!existingRepayment) {
          await tx.repayment.create({
            data: {
              userId: ledger.userId,
              loanId: ledger.loanId,
              total: application.total,
              amountPaid: BigInt(0),
              dueDate,
              status: "scheduled",
              attempts: [],
            },
          });
        }
        await tx.loanApplication.update({
          where: { id: application.id },
          data: { status: "active", dueDate, disbursementRef: event.uuid },
        });
        await tx.user.update({ where: { id: ledger.userId }, data: { loansTotal: { increment: 1 } } });
        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: "Loan Disbursed",
            body: `UGX ${Number(ledger.amount).toLocaleString()} has been sent to your mobile money.`,
            type: "success",
          },
        });
      } else {
        await tx.loanApplication.update({
          where: { id: application.id },
          data: {
            status: "offered",
            acceptedAt: null,
            disbursementRef: event.uuid,
            decisionNotes: "Mobile-money disbursement failed. The offer can be retried while still valid.",
          },
        });
        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: "Disbursement Failed",
            body: "We could not send your loan to mobile money. Your balance was not changed.",
            type: "warning",
          },
        });
      }
      return true;
    }

    if (ledger.type === "loan_payment") {
      if (!ledger.loanId) throw new Error("Repayment ledger is missing loanId");
      const repayment = await tx.repayment.findFirst({
        where: { userId: ledger.userId, loanId: ledger.loanId, pendingCollectionRef: event.reference },
      });
      if (!repayment) return true;

      const attempts = attemptsArray(repayment.attempts);
      const paymentAmount = Number(ledger.amount);
      if (event.isSuccess) {
        const newPaid = Math.min(Number(repayment.total), Number(repayment.amountPaid) + paymentAmount);
        const fullyPaid = newPaid >= Number(repayment.total);
        const receiptId = `RCPT-${event.reference.slice(0, 8).toUpperCase()}`;
        await tx.repayment.update({
          where: { id: repayment.id },
          data: {
            amountPaid: BigInt(newPaid),
            status: fullyPaid ? "paid" : repayment.status,
            receiptId,
            pendingCollectionRef: null,
            attempts: [...attempts, {
              at: new Date().toISOString(),
              method: "mobile-money-collection",
              amount: paymentAmount,
              success: true,
              reason: "provider-confirmed",
              reference: event.reference,
              provider_uuid: event.uuid,
            }] as Prisma.InputJsonValue,
          },
        });

        if (fullyPaid) {
          await tx.loanApplication.updateMany({
            where: { applicantId: ledger.userId, loanId: ledger.loanId, status: { not: "paid" } },
            data: { status: "paid" },
          });
          await tx.user.update({ where: { id: ledger.userId }, data: { loansRepaid: { increment: 1 } } });
        }
        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: fullyPaid ? "Loan Repaid" : "Payment Received",
            body: fullyPaid ? `Your loan is fully paid. Receipt: ${receiptId}.` : `UGX ${paymentAmount.toLocaleString()} was received. Receipt: ${receiptId}.`,
            type: "success",
          },
        });
      } else {
        await tx.repayment.update({
          where: { id: repayment.id },
          data: {
            pendingCollectionRef: null,
            attempts: [...attempts, {
              at: new Date().toISOString(),
              method: "mobile-money-collection",
              amount: paymentAmount,
              success: false,
              reason: "provider-declined-or-failed",
              reference: event.reference,
              provider_uuid: event.uuid,
            }] as Prisma.InputJsonValue,
          },
        });
        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: "Payment Not Completed",
            body: "The mobile-money repayment was not completed. Your loan balance was not changed.",
            type: "warning",
          },
        });
      }
      return true;
    }

    return true;
  });

  if (settled) {
    await writeAuditEvent({
      subjectUserId: ledger.userId,
      action: event.isSuccess ? "payment.provider_settled" : "payment.provider_failed",
      resourceType: "transaction",
      resourceId: ledger.id,
      metadata: { reference: event.reference, providerUuid: event.uuid, type: ledger.type, amount: event.amount, providerVerified: true },
    });
  }
  res.json({ received: true, settled });
});

export default router;
