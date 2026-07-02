/**
 * Wallet module: balance + topup (mobile-money wallet held by Kuula).
 */
import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { nextTransactionId } from "../../lib/ids.js";

export const walletRouter = Router();

walletRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query<{ balance: number }>(`SELECT balance FROM wallets WHERE user_id = $1`, [req.auth.userId]);
  res.json({ balance: Number(rows[0]?.balance ?? 0) });
}));

const topupSchema = z.object({ amount: z.number().positive() });

walletRouter.post("/topup", requireAuth, validate({ body: topupSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount } = req.body as z.infer<typeof topupSchema>;
  if (amount <= 0) throw new ApiError(400, "Invalid amount");

  const newBalance = await tx(async (db) => {
    const { rows } = await db.query<{ balance: number }>(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()
       RETURNING balance`,
      [req.auth!.userId, Math.round(amount)],
    );
    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, status, metadata) VALUES ($1, $2, 'wallet_topup', $3, 'completed', $4)`,
      [nextTransactionId(), req.auth!.userId, Math.round(amount), JSON.stringify({})],
    );
    return Number(rows[0].balance);
  });

  res.json({ balance: newBalance });
}));
