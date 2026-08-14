import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";

const DEFAULT_STALE_MINUTES = 30;

export async function flagStalePaymentTransactions(now = new Date()): Promise<number> {
  const configured = Number(process.env.RECONCILIATION_STALE_MINUTES || DEFAULT_STALE_MINUTES);
  const staleMinutes = Number.isFinite(configured) && configured >= 5 ? configured : DEFAULT_STALE_MINUTES;
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
  const result = await prisma.transaction.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
      reconciliationStatus: "unreconciled",
    },
    data: { reconciliationStatus: "reconciliation_required" },
  });

  // A stale provider callback on a split disbursement must surface at the batch
  // level as well. We do not retry or change financial settlement here.
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      UPDATE disbursement_legs l
      SET status='attention_required', failure_reason='Provider callback is stale and requires reconciliation', updated_at=CURRENT_TIMESTAMP
      FROM transactions t
      WHERE l.transaction_id=t.id
        AND t.type='loan_disbursement_leg'
        AND t.status='pending'
        AND t.reconciliation_status='reconciliation_required'
        AND l.status IN ('dispatching','pending')
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE disbursement_batches b
      SET status='attention_required', failure_reason='A disbursement transaction is awaiting reconciliation', updated_at=CURRENT_TIMESTAMP
      WHERE EXISTS (
        SELECT 1 FROM disbursement_legs l
        JOIN transactions t ON t.id=l.transaction_id
        WHERE l.batch_id=b.id
          AND t.type='loan_disbursement_leg'
          AND t.status='pending'
          AND t.reconciliation_status='reconciliation_required'
      )
        AND b.status <> 'settled'
    `),
  ]);
  return result.count;
}

export function startReconciliationSweeper(): () => void {
  const intervalMs = 5 * 60_000;
  const timer = setInterval(() => {
    flagStalePaymentTransactions().then((count) => {
      if (count > 0) console.warn(JSON.stringify({ event: "reconciliation.stale_flagged", count }));
    }).catch((error) => {
      console.error(JSON.stringify({ event: "reconciliation.sweeper_failed", message: error instanceof Error ? error.message : String(error) }));
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
