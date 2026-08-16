import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { parseMarzPayWebhook, verifyMarzPayFinalEvent } from "../lib/marzpay.js";

const router = Router();

async function markReconciliationRequired(transactionId: string): Promise<void> {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { reconciliationStatus: "reconciliation_required" },
  }).catch(() => {});
}

// MarZPay's public docs do not document a custom callback-signature header.
// Therefore Kuula never trusts a final callback by itself. A final callback is
// only a trigger to perform an authenticated server-to-server lookup of the
// provider transaction. Downstream settlement handlers receive the trusted
// provider response body, not the untrusted inbound body.
router.post("/marzpay/webhook", async (req: Request, res: Response, next: NextFunction) => {
  const callback = parseMarzPayWebhook(req.body);
  if (!callback.reference) return next();

  const ledger = await prisma.transaction.findUnique({
    where: { reference: callback.reference },
    select: { id: true, reference: true, amount: true, provider: true, transactionId: true, status: true },
  });
  if (!ledger || ledger.provider !== "marzpay") return next();

  // Non-final updates cannot mutate balances/repayments in downstream routes;
  // keep them as informational provider status updates.
  if (!callback.isFinal) return next();

  if (!ledger.transactionId) {
    await markReconciliationRequired(ledger.id);
    res.status(409).json({ error: "Provider transaction identity is missing; reconciliation is required" });
    return;
  }

  try {
    const trusted = await verifyMarzPayFinalEvent({
      callback,
      expectedUuid: ledger.transactionId,
      expectedReference: ledger.reference || callback.reference,
      expectedAmount: Number(ledger.amount),
    });
    req.body = trusted.payload;
    next();
  } catch (error) {
    await markReconciliationRequired(ledger.id);
    res.status(409).json({
      error: "Payment callback could not be independently verified with MarZPay",
      detail: process.env.NODE_ENV === "production" ? undefined : (error instanceof Error ? error.message : String(error)),
    });
  }
});

export default router;
