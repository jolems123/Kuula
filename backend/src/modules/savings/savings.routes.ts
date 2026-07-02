/**
 * Savings module: balance (with accrued interest), deposit, withdraw, goals.
 */
import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { accrueSavingsInterest, COMPLIANCE } from "../../lib/core.js";
import { nextTransactionId, nextGoalId } from "../../lib/ids.js";

export const savingsRouter = Router();

savingsRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query<{ balance: number; updated_at: Date }>(
    `SELECT balance, updated_at FROM savings_accounts WHERE user_id = $1`, [req.auth.userId],
  );
  if (!rows[0]) { res.json({ balance: 0, accruedInterest: 0, aprPercent: COMPLIANCE.SAVINGS_APR * 100 }); return; }

  const balance = Number(rows[0].balance);
  const accrued = accrueSavingsInterest(balance, rows[0].updated_at.getTime());
  res.json({ balance, accruedInterest: accrued, aprPercent: COMPLIANCE.SAVINGS_APR * 100 });
  return;
}));

const amountSchema = z.object({ amount: z.number().positive() });

savingsRouter.post("/deposit", requireAuth, validate({ body: amountSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount } = req.body as z.infer<typeof amountSchema>;
  if (amount <= 0) throw new ApiError(400, "Invalid amount");

  const newBalance = await tx(async (db) => {
    // Upsert the savings row (created lazily if missing).
    const { rows } = await db.query<{ balance: number }>(
      `INSERT INTO savings_accounts (user_id, balance, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET balance = savings_accounts.balance + $2, updated_at = NOW()
       RETURNING balance`,
      [req.auth!.userId, Math.round(amount)],
    );
    // Ledger entry.
    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, status, metadata) VALUES ($1, $2, 'savings_deposit', $3, 'completed', $4)`,
      [nextTransactionId(), req.auth!.userId, Math.round(amount), JSON.stringify({})],
    );
    return Number(rows[0].balance);
  });

  res.json({ balance: newBalance });
}));

savingsRouter.post("/withdraw", requireAuth, validate({ body: amountSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount } = req.body as z.infer<typeof amountSchema>;
  if (amount <= 0) throw new ApiError(400, "Invalid amount");

  const newBalance = await tx(async (db) => {
    const { rows } = await db.query<{ balance: number }>(
      `SELECT balance FROM savings_accounts WHERE user_id = $1 FOR UPDATE`, [req.auth!.userId],
    );
    const current = Number(rows[0]?.balance ?? 0);
    if (amount > current) throw new ApiError(400, "Insufficient savings balance");
    const updated = current - Math.round(amount);
    await db.query(
      `UPDATE savings_accounts SET balance = $2, updated_at = NOW() WHERE user_id = $1`,
      [req.auth!.userId, updated],
    );
    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, status, metadata) VALUES ($1, $2, 'savings_withdrawal', $3, 'completed', $4)`,
      [nextTransactionId(), req.auth!.userId, Math.round(amount), JSON.stringify({})],
    );
    return updated;
  });

  res.json({ balance: newBalance });
}));

// ── Savings goals ───────────────────────────────────────────────────────────

savingsRouter.get("/goals", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query(
    `SELECT id, name, target, saved, deadline, emoji FROM savings_goals WHERE user_id = $1 AND archived = FALSE ORDER BY created_at ASC`,
    [req.auth.userId],
  );
  res.json({ goals: rows });
}));

const createGoalSchema = z.object({
  name: z.string().min(1).max(80),
  target: z.number().positive(),
  deadline: z.string().optional(),
  emoji: z.string().optional(),
});

savingsRouter.post("/goals", requireAuth, validate({ body: createGoalSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { name, target, deadline, emoji } = req.body as z.infer<typeof createGoalSchema>;
  const id = nextGoalId();
  await query(
    `INSERT INTO savings_goals (id, user_id, name, target, saved, deadline, emoji) VALUES ($1, $2, $3, $4, 0, $5, $6)`,
    [id, req.auth.userId, name, Math.round(target), deadline ?? null, emoji ?? "🎯"],
  );
  res.status(201).json({ id, name, target, saved: 0, deadline, emoji: emoji ?? "🎯" });
}));
