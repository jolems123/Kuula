import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { flagStalePaymentTransactions, verifyTransactionWithProvider } from "../lib/reconciliation.js";
import { AWAITING_PROVIDER } from "../lib/marzpay-settlement.js";
import { runProviderReconciliation } from "../lib/provider-reconciliation.js";
import { Prisma } from "@prisma/client";
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

// Trial balance from posted journals: per account, total debits, total credits and the
// net debit balance. Optional ?asOf=YYYY-MM-DD includes journals posted up to that day.
router.get("/trial-balance", async (req: Request, res: Response) => {
  const asOfRaw = typeof req.query.asOf === "string" ? req.query.asOf : "";
  const asOf = asOfRaw ? new Date(`${asOfRaw}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new AppError("asOf must be a date (YYYY-MM-DD)", 400);
  const rows = await prisma.journalEntry.groupBy({
    by: ["accountCode", "direction"],
    where: { journal: { postedAt: { lte: asOf } } },
    _sum: { amount: true },
  });
  const accounts = new Map<string, { account: string; debit: number; credit: number }>();
  for (const row of rows) {
    const entry = accounts.get(row.accountCode) ?? { account: row.accountCode, debit: 0, credit: 0 };
    entry[row.direction === "debit" ? "debit" : "credit"] += Number(row._sum.amount ?? 0);
    accounts.set(row.accountCode, entry);
  }
  const list = [...accounts.values()].sort((a, b) => a.account.localeCompare(b.account)).map((entry) => ({ ...entry, balance: entry.debit - entry.credit }));
  const totals = list.reduce((sum, entry) => ({ debit: sum.debit + entry.debit, credit: sum.credit + entry.credit }), { debit: 0, credit: 0 });
  res.json({ asOf: asOf.toISOString(), accounts: list, totals, balanced: totals.debit === totals.credit });
});

// Daily comparison against MarzPay's records. Runs automatically for the previous day
// after 01:00 UTC; finance can also run any past day on demand.
router.get("/provider-runs", async (_req: Request, res: Response) => {
  const runs = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, provider, day, status, summary, error, triggered_by, started_at, finished_at,
           jsonb_array_length(exceptions) AS exception_count
    FROM provider_reconciliation_runs ORDER BY day DESC, started_at DESC LIMIT 60
  `);
  res.json({ runs: runs.map((run) => ({ ...run, exception_count: Number(run.exception_count) })) });
});

router.get("/provider-runs/:id", async (req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM provider_reconciliation_runs WHERE id=${String(req.params.id)}::uuid LIMIT 1`);
  if (!rows[0]) throw new AppError("Reconciliation run not found", 404);
  res.json({ run: rows[0] });
});

router.post("/provider-runs", async (req: Request, res: Response) => {
  const day = String(req.body?.day || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T00:00:00Z`).getTime())) throw new AppError("day must be a date (YYYY-MM-DD)", 400);
  const today = new Date().toISOString().slice(0, 10);
  // Only finished days are meaningful; the automated test suite may also check today.
  if (day > today || (day === today && process.env.NODE_ENV !== "test")) throw new AppError("Only completed past days can be reconciled", 400);
  const result = await runProviderReconciliation(day, req.user!.userId);
  await writeAuditEvent({ actorId: req.user!.userId, action: "payment.provider_reconciliation_run", resourceType: "provider_reconciliation_run", resourceId: result.id, metadata: { day, status: result.status } });
  res.json(result);
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
