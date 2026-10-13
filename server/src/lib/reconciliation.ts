import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { startRepaymentReminderSweeper } from "./repayment-reminders.js";
import { lookupMarzPayTransaction, marzPayLookupConfigured } from "./marzpay.js";
import { AWAITING_PROVIDER, settleMarzPayEvent, type SettlementOutcome } from "./marzpay-settlement.js";

const DEFAULT_STALE_MINUTES = 30;
const VERIFY_MIN_AGE_MS = 2 * 60_000;
const NOT_FOUND_ESCALATION_MS = 24 * 60 * 60_000;
const VERIFY_BATCH_SIZE = 25;

/**
 * Marks transactions whose final status has not arrived in time as awaiting the
 * provider. They stay pending, so a late callback or status lookup can still settle
 * them; nothing is retried and no money state changes here.
 */
export async function flagStalePaymentTransactions(now = new Date()): Promise<number> {
  const configured = Number(process.env.RECONCILIATION_STALE_MINUTES || DEFAULT_STALE_MINUTES);
  const staleMinutes = Number.isFinite(configured) && configured >= 5 ? configured : DEFAULT_STALE_MINUTES;
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
  const result = await prisma.transaction.updateMany({
    where: { status: "pending", createdAt: { lt: cutoff }, reconciliationStatus: "unreconciled" },
    data: { reconciliationStatus: AWAITING_PROVIDER },
  });
  return result.count;
}

export interface VerificationResult {
  transactionId: string;
  reference: string;
  lookup: "found" | "not_found" | "error";
  providerStatus?: string;
  settlement?: SettlementOutcome;
  message?: string;
}

/** Asks MarzPay for the real status of one transaction and applies it if it is final. */
export async function verifyTransactionWithProvider(transactionId: string, now = new Date()): Promise<VerificationResult> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || !transaction.reference) throw new Error("Transaction not found");
  const base = { transactionId, reference: transaction.reference };
  const lookup = await lookupMarzPayTransaction({ reference: transaction.reference, uuid: transaction.transactionId });
  if (lookup.state === "error") return { ...base, lookup: "error", message: lookup.message };
  if (lookup.state === "not_found") {
    if (transaction.status === "pending" && now.getTime() - transaction.createdAt.getTime() > NOT_FOUND_ESCALATION_MS) {
      await prisma.transaction.updateMany({
        where: { id: transaction.id, status: "pending", reconciliationStatus: { in: ["unreconciled", AWAITING_PROVIDER] } },
        data: { reconciliationStatus: "reconciliation_required" },
      });
    }
    return { ...base, lookup: "not_found" };
  }
  const settlement = await settleMarzPayEvent(lookup.event);
  return { ...base, lookup: "found", providerStatus: lookup.event.status, settlement };
}

/** Checks the oldest open MarzPay transactions against MarzPay itself. */
export async function verifyPendingWithProvider(now = new Date()): Promise<VerificationResult[]> {
  if (!marzPayLookupConfigured()) return [];
  const pending = await prisma.transaction.findMany({
    where: {
      provider: "marzpay",
      status: "pending",
      createdAt: { lt: new Date(now.getTime() - VERIFY_MIN_AGE_MS) },
      reconciliationStatus: { in: ["unreconciled", AWAITING_PROVIDER] },
    },
    orderBy: { updatedAt: "asc" },
    take: VERIFY_BATCH_SIZE,
    select: { id: true },
  });
  const results: VerificationResult[] = [];
  for (const row of pending) {
    try {
      results.push(await verifyTransactionWithProvider(row.id, now));
    } catch (error) {
      results.push({ transactionId: row.id, reference: "", lookup: "error", message: error instanceof Error ? error.message : String(error) });
    }
    // Rotate through the queue so one stubborn transaction never starves the rest.
    await prisma.$executeRaw(Prisma.sql`UPDATE transactions SET updated_at=CURRENT_TIMESTAMP WHERE id=${row.id}::uuid AND status='pending'`);
  }
  return results;
}

export function startReconciliationSweeper(): () => void {
  const intervalMs = 5 * 60_000;
  const stopRepaymentReminderSweeper = startRepaymentReminderSweeper();
  const timer = setInterval(() => {
    flagStalePaymentTransactions()
      .then((count) => { if (count > 0) console.warn(JSON.stringify({ event: "reconciliation.stale_flagged", count })); })
      .then(() => verifyPendingWithProvider())
      .then((results) => {
        const settled = results.filter((result) => result.settlement?.body.settled === true).length;
        if (results.length > 0) console.log(JSON.stringify({ event: "reconciliation.provider_verified", checked: results.length, settled }));
      })
      .catch((error) => {
        console.error(JSON.stringify({ event: "reconciliation.sweeper_failed", message: error instanceof Error ? error.message : String(error) }));
      });
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    stopRepaymentReminderSweeper();
  };
}
