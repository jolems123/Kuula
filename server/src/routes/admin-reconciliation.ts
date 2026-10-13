import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { flagStalePaymentTransactions, verifyTransactionWithProvider } from "../lib/reconciliation.js";
import { AWAITING_PROVIDER } from "../lib/marzpay-settlement.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
router.use(authenticateToken, requirePermissions("reconciliation.manage"));

router.get("/", async (req: Request, res: Response) => {
  // "open" (the default) is everything a person may need to look at.
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  const take = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const transactions = await prisma.transaction.findMany({
    where: status === "all" ? {} : status === "open"
      ? { reconciliationStatus: { in: ["reconciliation_required", AWAITING_PROVIDER] } }
      : { reconciliationStatus: status },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      userId: true,
      loanId: true,
      type: true,
      amount: true,
      status: true,
      reference: true,
      provider: true,
      providerStatus: true,
      providerAmount: true,
      providerCurrency: true,
      providerFee: true,
      transactionId: true,
      reconciliationStatus: true,
      reconciledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({
    transactions: transactions.map((row) => ({
      ...row,
      amount: Number(row.amount),
      providerAmount: row.providerAmount == null ? null : Number(row.providerAmount),
      providerFee: row.providerFee == null ? null : Number(row.providerFee),
    })),
  });
});

router.post("/flag-stale", async (_req: Request, res: Response) => {
  const count = await flagStalePaymentTransactions();
  res.json({ ok: true, flagged: count });
});

// Asks MarzPay for the transaction's real status and applies it if final. This is the
// controlled way to resolve an uncertain payout or collection; it never sends money.
router.post("/:id/verify", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const transaction = await prisma.transaction.findUnique({ where: { id }, select: { id: true, userId: true, provider: true } });
  if (!transaction) throw new AppError("Transaction not found", 404);
  if (transaction.provider !== "marzpay") throw new AppError("Only MarzPay transactions can be verified with MarzPay", 409);
  const result = await verifyTransactionWithProvider(id);
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: transaction.userId,
    action: "payment.provider_verification_requested",
    resourceType: "transaction",
    resourceId: id,
    metadata: { lookup: result.lookup, providerStatus: result.providerStatus ?? null, settlement: result.settlement?.body ?? null, message: result.message ?? null },
  });
  res.json(result);
});

router.post("/:id/review", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const note = String(req.body?.note || "").trim();
  if (!note) throw new AppError("A reconciliation review note is required", 400);
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) throw new AppError("Transaction not found", 404);
  if (transaction.reconciliationStatus !== "reconciliation_required") {
    throw new AppError("Only transactions requiring reconciliation can be marked reviewed", 409);
  }

  // This endpoint deliberately does not alter transaction.status, loan balances,
  // repayments, or journals. Financial settlement can only come from a verified
  // provider event/reconciliation integration.
  await prisma.transaction.update({
    where: { id },
    data: { reconciliationStatus: "reviewed" },
  });
  await writeAuditEvent({
    actorId: req.user!.userId,
    subjectUserId: transaction.userId,
    action: "payment.reconciliation_reviewed",
    resourceType: "transaction",
    resourceId: transaction.id,
    metadata: { note },
  });
  res.json({ ok: true, status: "reviewed" });
});

router.get("/:id/journal", async (req: Request, res: Response) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: String(req.params.id) },
    include: { journal: { include: { entries: true } } },
  });
  if (!transaction) throw new AppError("Transaction not found", 404);
  res.json({
    journal: transaction.journal ? {
      ...transaction.journal,
      entries: transaction.journal.entries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
    } : null,
  });
});

export default router;
