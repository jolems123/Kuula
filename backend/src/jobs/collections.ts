/**
 * Hourly auto-collection sweep. For every due unpaid loan, attempt a
 * mobile-money debit and record the result. Mirrors the Supabase Edge Function
 * `auto-collect` so both backends behave identically.
 *
 * Runs on a setInterval with .unref() so it never blocks process exit, and can
 * also be triggered manually via POST /api/collections/run (admin-only).
 */
import { query, tx } from "../db/client.js";
import { logger } from "../middleware/logger.js";
import { attemptAutoPay } from "../lib/core.js";
import { nextTransactionId, nextReceiptId } from "../lib/ids.js";

const HOUR_MS = 60 * 60 * 1000;

export async function runCollections(now = Date.now()): Promise<{ collected: number; failed: number }> {
  const { rows: due } = await query<{ loan_id: string; user_id: string; total: number; amount_paid: number; due_date: Date }>(
    `SELECT r.loan_id, l.user_id, r.total, r.amount_paid, r.due_date
     FROM repayments r JOIN loans l ON l.id = r.loan_id
     WHERE r.status = 'scheduled' AND r.due_date <= NOW()`,
  );
  if (due.length === 0) return { collected: 0, failed: 0 };

  let collected = 0;
  let failed = 0;

  for (const r of due) {
    try {
      const result = await tx(async (db) => {
        const { rows: walletRows } = await db.query<{ balance: number }>(
          `SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [r.user_id],
        );
        const walletBalance = Number(walletRows[0]?.balance ?? 0);
        const rep = { loanId: r.loan_id, total: Number(r.total), amountPaid: Number(r.amount_paid), status: "scheduled", dueDate: r.due_date.getTime(), autoPayEnabled: true, attempts: [] as any[] };
        const attempt = attemptAutoPay(rep, walletBalance, now);

        await db.query(
          `INSERT INTO repayment_attempts (loan_id, method, amount, success, reason) VALUES ($1, $2, $3, $4, $5)`,
          [r.loan_id, attempt.method, attempt.amount, attempt.success, attempt.reason],
        );

        if (attempt.success) {
          const receipt = { id: nextReceiptId(), amount: attempt.amount, paidAt: new Date(now).toISOString(), method: "MoMo auto-debit" };
          await db.query(
            `UPDATE repayments SET amount_paid = total, status = 'paid', paid_at = NOW(), receipt = $2 WHERE loan_id = $1`,
            [r.loan_id, JSON.stringify(receipt)],
          );
          await db.query(`UPDATE loans SET status = 'paid', paid_at = NOW() WHERE id = $1`, [r.loan_id]);
          await db.query(`UPDATE wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1`, [r.user_id, attempt.amount]);
          await db.query(
            `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, metadata) VALUES ($1, $2, $3, 'loan_payment', $4, 'completed', $5)`,
            [nextTransactionId(), r.user_id, r.loan_id, attempt.amount, JSON.stringify(receipt)],
          );
          return true;
        }
        // Mark overdue if past due + unpaid.
        await db.query(`UPDATE repayments SET status = 'overdue' WHERE loan_id = $1 AND status = 'scheduled'`, [r.loan_id]);
        await db.query(`UPDATE loans SET status = 'overdue' WHERE id = $1 AND status = 'active'`, [r.loan_id]);
        return false;
      });
      if (result) collected++;
      else failed++;
    } catch (err) {
      failed++;
      logger.error({ err, loan_id: r.loan_id }, "collections sweep error");
    }
  }

  logger.info({ collected, failed }, "collections sweep done");
  return { collected, failed };
}

let timer: NodeJS.Timeout | null = null;

export function startCollectionsSweep(intervalMs = HOUR_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    runCollections().catch((err) => logger.error({ err }, "collections sweep crashed"));
  }, intervalMs);
  timer.unref();
}

export function stopCollectionsSweep(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
