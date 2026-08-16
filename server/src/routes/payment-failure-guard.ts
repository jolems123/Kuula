import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook } from "../lib/marzpay.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

function attemptsArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

// The legacy generic payment handler historically marked all final callbacks as
// reconciled, including failures. Handle non-tranche failures here so a failed
// provider event remains visible to reconciliation and never appears "matched".
router.post("/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  const event = parseMarzPayWebhook(req.body);
  if (!event.reference || !event.isFinal || !event.isFailure) return next();

  const ledger = await prisma.transaction.findUnique({ where: { reference: event.reference } });
  if (!ledger || ledger.type === "loan_disbursement_leg") return next();

  const claimed = await prisma.$transaction(async (tx) => {
    const update = await tx.transaction.updateMany({
      where: { id: ledger.id, status: "pending" },
      data: {
        status: "failed",
        providerStatus: event.status,
        transactionId: event.uuid || ledger.transactionId,
        providerPayload: event.payload as Prisma.InputJsonValue,
        providerAmount: event.amount === null ? null : BigInt(event.amount),
        providerCurrency: event.amount === null ? null : "UGX",
        reconciliationStatus: "reconciliation_required",
        reconciledAt: null,
      },
    });
    if (update.count !== 1) return false;

    if (ledger.type === "loan_payment" && ledger.loanId) {
      const repayment = await tx.repayment.findFirst({
        where: { userId: ledger.userId, loanId: ledger.loanId, pendingCollectionRef: event.reference },
      });
      if (repayment) {
        await tx.repayment.update({
          where: { id: repayment.id },
          data: {
            pendingCollectionRef: null,
            attempts: [...attemptsArray(repayment.attempts), {
              at: new Date().toISOString(),
              method: "mobile-money-collection",
              amount: Number(ledger.amount),
              success: false,
              reason: "provider-declined-or-failed",
              reference: event.reference,
              provider_uuid: event.uuid,
            }] as Prisma.InputJsonValue,
          },
        });
      }
      await tx.notification.create({
        data: {
          userId: ledger.userId,
          title: "Payment Not Completed",
          body: "The mobile-money repayment was not completed. Your loan balance was not changed.",
          type: "warning",
        },
      });
    }

    if (ledger.type === "loan_disbursement" && ledger.loanId) {
      await tx.loanApplication.updateMany({
        where: { applicantId: ledger.userId, loanId: ledger.loanId, status: "disbursing" },
        data: { status: "offered", acceptedAt: null, disbursementRef: event.uuid || event.reference },
      });
    }
    return true;
  });

  if (claimed) {
    await writeAuditEvent({
      subjectUserId: ledger.userId,
      action: "payment.provider_failed",
      resourceType: "transaction",
      resourceId: ledger.id,
      metadata: { reference: event.reference, providerUuid: event.uuid, type: ledger.type, amount: event.amount },
    });
  }

  res.json({ received: true, settled: claimed, failed: true, reconciliationStatus: "reconciliation_required" });
});

export default router;
