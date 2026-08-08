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
