import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { listMarzPayTransactionsForDay, marzPayLookupConfigured, type MarzPayListedTransaction } from "./marzpay.js";

/**
 * Daily comparison of Kuula's MarzPay transactions against MarzPay's own records for
 * one calendar day (UTC). It changes no money and no transaction state: it records
 * every difference for finance to investigate and resolve.
 */
export interface KuulaSideTransaction {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
}

export type ReconciliationException =
  | { kind: "missing_at_provider"; reference: string; kuulaStatus: string; amount: number; type: string }
  | { kind: "missing_at_kuula"; references: string[]; providerStatus: string; amount: number | null; providerUuid: string }
  | { kind: "status_mismatch"; reference: string; kuulaStatus: string; providerStatus: string; amount: number }
  | { kind: "amount_mismatch"; reference: string; kuulaAmount: number; providerAmount: number };

export interface ReconciliationComparison {
  summary: { kuulaCount: number; providerCount: number; matched: number; exceptions: number; kuulaCompletedAmount: number; providerCompletedAmount: number };
  exceptions: ReconciliationException[];
}

function normalizedStatus(status: string): "completed" | "failed" | "pending" {
  if (/^(completed|successful|success)$/.test(status)) return "completed";
  if (/^(failed|failure|cancelled|canceled|rejected)$/.test(status)) return "failed";
  return "pending";
}

export function compareWithProvider(kuula: KuulaSideTransaction[], provider: MarzPayListedTransaction[]): ReconciliationComparison {
  const byReference = new Map<string, MarzPayListedTransaction>();
  for (const row of provider) for (const reference of row.references) byReference.set(reference, row);
  const seenProvider = new Set<MarzPayListedTransaction>();
  const exceptions: ReconciliationException[] = [];
  let matched = 0;

  for (const transaction of kuula) {
    const match = byReference.get(transaction.reference);
    if (!match) {
      // A request MarzPay definitely rejected never existed on its side; that is expected.
      if (transaction.status !== "failed") {
        exceptions.push({ kind: "missing_at_provider", reference: transaction.reference, kuulaStatus: transaction.status, amount: transaction.amount, type: transaction.type });
      } else {
        matched += 1;
      }
      continue;
    }
    seenProvider.add(match);
    const kuulaStatus = normalizedStatus(transaction.status);
    const providerStatus = normalizedStatus(match.status);
    if (kuulaStatus !== providerStatus) {
      exceptions.push({ kind: "status_mismatch", reference: transaction.reference, kuulaStatus: transaction.status, providerStatus: match.status, amount: transaction.amount });
      continue;
    }
    if (match.amount !== null && match.amount !== transaction.amount) {
      exceptions.push({ kind: "amount_mismatch", reference: transaction.reference, kuulaAmount: transaction.amount, providerAmount: match.amount });
      continue;
    }
    matched += 1;
  }
  for (const row of provider) {
    if (seenProvider.has(row)) continue;
    exceptions.push({ kind: "missing_at_kuula", references: row.references, providerStatus: row.status, amount: row.amount, providerUuid: row.uuid });
  }

  const completed = (status: string) => normalizedStatus(status) === "completed";
  return {
    summary: {
      kuulaCount: kuula.length,
      providerCount: provider.length,
      matched,
      exceptions: exceptions.length,
      kuulaCompletedAmount: kuula.filter((row) => completed(row.status)).reduce((sum, row) => sum + row.amount, 0),
      providerCompletedAmount: provider.filter((row) => completed(row.status)).reduce((sum, row) => sum + (row.amount ?? 0), 0),
    },
    exceptions,
  };
}

export async function runProviderReconciliation(day: string, triggeredBy: string | null = null): Promise<{ id: string; status: string; summary: ReconciliationComparison["summary"] | null; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("day must be YYYY-MM-DD");
  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO provider_reconciliation_runs (id, provider, day, status, triggered_by) VALUES (${id}::uuid, 'marzpay', ${day}::date, 'running', ${triggeredBy}::uuid)
  `);
  try {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const kuulaRows = await prisma.transaction.findMany({
      where: { provider: "marzpay", createdAt: { gte: start, lt: end }, reference: { not: null } },
      select: { id: true, reference: true, type: true, status: true, amount: true },
    });
    const providerRows = await listMarzPayTransactionsForDay(day);
    const comparison = compareWithProvider(
      kuulaRows.map((row) => ({ id: row.id, reference: row.reference!, type: row.type, status: row.status, amount: Number(row.amount) })),
      providerRows,
    );
    const status = comparison.exceptions.length === 0 ? "matched" : "exceptions";
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_reconciliation_runs
      SET status=${status}, summary=${JSON.stringify(comparison.summary)}::jsonb, exceptions=${JSON.stringify(comparison.exceptions)}::jsonb, finished_at=CURRENT_TIMESTAMP
      WHERE id=${id}::uuid
    `);
    return { id, status, summary: comparison.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE provider_reconciliation_runs SET status='failed', error=${message}, finished_at=CURRENT_TIMESTAMP WHERE id=${id}::uuid
    `);
    return { id, status: "failed", summary: null, error: message };
  }
}

/** Runs yesterday's reconciliation once, the first time this is called after 01:00 UTC. */
export async function runDailyReconciliationIfDue(now = new Date()): Promise<boolean> {
  if (!marzPayLookupConfigured() || now.getUTCHours() < 1) return false;
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM provider_reconciliation_runs WHERE provider='marzpay' AND day=${yesterday}::date AND status <> 'failed' LIMIT 1
  `);
  if (existing[0]) return false;
  await runProviderReconciliation(yesterday);
  return true;
}
