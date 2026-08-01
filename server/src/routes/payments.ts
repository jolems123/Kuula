import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook, secureTokenEquals } from "../lib/marzpay.js";

const router = Router();

function attemptsArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

router.post("/marzpay/webhook", async (req: Request, res: Response) => {
  const expectedToken = process.env.MARZPAY_WEBHOOK_SECRET?.trim() || "";
  const suppliedToken = String(req.query.token ?? req.headers["x-webhook-token"] ?? "");

  if (!expectedToken) {
    console.error("MarZPay webhook rejected: MARZPAY_WEBHOOK_SECRET is not configured");
    res.status(503).json({ error: "Webhook is not configured" });
    return;
  }
  if (!secureTokenEquals(suppliedToken, expectedToken)) {
    res.status(401).json({ error: "Invalid webhook token" });
    return;
  }

  const event = parseMarzPayWebhook(req.body);
  if (!event.reference) {
    res.status(400).json({ error: "Webhook transaction reference is required" });
    return;
  }

  const ledger = await prisma.transaction.findUnique({ where: { reference: event.reference } });
  if (!ledger) {
    console.warn("Ignoring MarZPay webhook with unknown reference", event.reference);
    res.json({ received: true, ignored: true });
    return;
  }

  if (!event.isFinal) {
    await prisma.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        providerStatus: event.status,
        transactionId: event.uuid || ledger.transactionId,
        providerPayload: event.payload as Prisma.InputJsonValue,
      },
    });
    res.json({ received: true, pending: true });
    return;
  }

  const settled = await prisma.$transaction(async (tx) => {
    // Only a pending ledger entry can mutate financial state. This compare-and-
    // set makes duplicate and reordered callbacks harmless.
    const claim = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: event.isSuccess ? "completed" : "failed",
        providerStatus: event.status,
        transactionId: event.uuid || ledger.transactionId,
        providerPayload: event.payload as Prisma.InputJsonValue,
      },
    });
    if (claim.count !== 1) return false;

    if (ledger.type === "loan_disbursement") {
      if (!ledger.loanId) throw new Error("Disbursement ledger is missing loanId");

      const application = await tx.loanApplication.findFirst({
        where: { applicantId: ledger.userId, loanId: ledger.loanId },
      });
      if (!application) throw new Error("Loan application for disbursement was not found");

      if (event.isSuccess) {
        const dueDate = new Date(Date.now() + application.termDays * 86_400_000);
        const existingRepayment = await tx.repayment.findFirst({
          where: { userId: ledger.userId, loanId: ledger.loanId },
        });

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
          data: {
            status: "active",
            dueDate,
            disbursementRef: event.uuid || event.reference,
          },
        });
        await tx.user.update({
          where: { id: ledger.userId },
          data: { loansTotal: { increment: 1 } },
        });
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
            disbursementRef: event.uuid || event.reference,
            decisionNotes: "Mobile-money disbursement failed. The offer can be retried.",
          },
        });
        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: "Disbursement Failed",
            body: "We could not send your loan to mobile money. Your approved offer remains available.",
            type: "warning",
          },
        });
      }
      return true;
    }

    if (ledger.type === "loan_payment") {
      if (!ledger.loanId) throw new Error("Repayment ledger is missing loanId");

      // Match the exact locked collection reference. This prevents a callback
      // from settling the wrong installment when multiple loans exist.
      const repayment = await tx.repayment.findFirst({
        where: {
          userId: ledger.userId,
          loanId: ledger.loanId,
          pendingCollectionRef: event.reference,
        },
      });
      if (!repayment) return true;

      const attempts = attemptsArray(repayment.attempts);
      const paymentAmount = Number(ledger.amount);

      if (event.isSuccess) {
        const newPaid = Math.min(
          Number(repayment.total),
          Number(repayment.amountPaid) + paymentAmount
        );
        const fullyPaid = newPaid >= Number(repayment.total);
        const receiptId = `RCPT-${event.reference.slice(0, 8).toUpperCase()}`;

        await tx.repayment.update({
          where: { id: repayment.id },
          data: {
            amountPaid: BigInt(newPaid),
            status: fullyPaid ? "paid" : repayment.status,
            receiptId,
            pendingCollectionRef: null,
            attempts: [
              ...attempts,
              {
                at: new Date().toISOString(),
                method: "mobile-money-collection",
                amount: paymentAmount,
                success: true,
                reason: "provider-confirmed",
                reference: event.reference,
                provider_uuid: event.uuid,
              },
            ] as Prisma.InputJsonValue,
          },
        });

        if (fullyPaid) {
          await tx.loanApplication.updateMany({
            where: {
              applicantId: ledger.userId,
              loanId: ledger.loanId,
              status: { not: "paid" },
            },
            data: { status: "paid" },
          });
          await tx.user.update({
            where: { id: ledger.userId },
            data: { loansRepaid: { increment: 1 } },
          });
        }

        await tx.notification.create({
          data: {
            userId: ledger.userId,
            title: fullyPaid ? "Loan Repaid" : "Payment Received",
            body: fullyPaid
              ? `Your loan is fully paid. Receipt: ${receiptId}.`
              : `UGX ${paymentAmount.toLocaleString()} was received. Receipt: ${receiptId}.`,
            type: "success",
          },
        });
      } else {
        await tx.repayment.update({
          where: { id: repayment.id },
          data: {
            pendingCollectionRef: null,
            attempts: [
              ...attempts,
              {
                at: new Date().toISOString(),
                method: "mobile-money-collection",
                amount: paymentAmount,
                success: false,
                reason: "provider-declined-or-failed",
                reference: event.reference,
                provider_uuid: event.uuid,
              },
            ] as Prisma.InputJsonValue,
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

  res.json({ received: true, settled });
});

export default router;
