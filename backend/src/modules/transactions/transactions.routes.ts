/**
 * Transactions module: ledger list.
 */
import { Router } from "express";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { serializeTransaction } from "../../lib/serialize.js";

export const transactionsRouter = Router();

transactionsRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = req.auth.role === "admin"
    ? await query(
      `SELECT id, user_id, loan_id, type, amount, status, transaction_id, metadata, created_at
       FROM transactions ORDER BY created_at DESC LIMIT 500`,
    )
    : await query(
      `SELECT id, user_id, loan_id, type, amount, status, transaction_id, metadata, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.auth.userId],
    );
  res.json({ transactions: rows.map((r: any) => serializeTransaction(r)) });
}));
