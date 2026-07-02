/**
 * Admin module: dashboard stats, customer list, customer detail.
 */
import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { query } from "../../db/client.js";

export const adminRouter = Router();

adminRouter.get("/stats", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const [users, loans, savings, repayments, transactions, disbursements] = await Promise.all([
    query<{ c: string; verified: string }>(`SELECT COUNT(*)::text AS c, COUNT(*) FILTER (WHERE verified)::text AS verified FROM users WHERE role = 'user' AND deleted_at IS NULL`),
    query<{ total: string; active: string; paid: string; total_amount: string; total_disbursed: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'active')::text AS active,
              COUNT(*) FILTER (WHERE status = 'paid')::text AS paid,
              COALESCE(SUM(amount), 0)::text AS total_amount,
              COALESCE(SUM(amount) FILTER (WHERE status IN ('active','paid')), 0)::text AS total_disbursed
       FROM loans`,
    ),
    query<{ total_balance: string }>(`SELECT COALESCE(SUM(balance), 0)::text AS total_balance FROM savings_accounts`),
    query<{ due: string; paid: string; overdue: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'scheduled' AND due_date > NOW())::text AS due,
              COUNT(*) FILTER (WHERE status = 'paid')::text AS paid,
              COUNT(*) FILTER (WHERE status = 'scheduled' AND due_date < NOW())::text AS overdue
       FROM repayments`,
    ),
    query<{ c: string; volume: string }>(`SELECT COUNT(*)::text AS c, COALESCE(SUM(amount), 0)::text AS volume FROM transactions`),
    query<{ c: string; volume: string }>(`SELECT COUNT(*)::text AS c, COALESCE(SUM(amount), 0)::text AS volume FROM disbursements WHERE status = 'completed'`),
  ]);

  res.json({
    users: { count: Number(users.rows[0]?.c ?? 0), verified: Number(users.rows[0]?.verified ?? 0) },
    loans: {
      total: Number(loans.rows[0]?.total ?? 0),
      active: Number(loans.rows[0]?.active ?? 0),
      paid: Number(loans.rows[0]?.paid ?? 0),
      totalAmount: Number(loans.rows[0]?.total_amount ?? 0),
      totalDisbursed: Number(loans.rows[0]?.total_disbursed ?? 0),
    },
    savings: { totalBalance: Number(savings.rows[0]?.total_balance ?? 0) },
    repayments: {
      due: Number(repayments.rows[0]?.due ?? 0),
      paid: Number(repayments.rows[0]?.paid ?? 0),
      overdue: Number(repayments.rows[0]?.overdue ?? 0),
    },
    transactions: { count: Number(transactions.rows[0]?.c ?? 0), volume: Number(transactions.rows[0]?.volume ?? 0) },
    disbursements: { count: Number(disbursements.rows[0]?.c ?? 0), volume: Number(disbursements.rows[0]?.volume ?? 0) },
  });
}));

adminRouter.get("/customers", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit ?? 50));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.phone, u.email, u.district, u.occupation, u.verified, u.kyc_status, u.member_since, u.created_at,
            COALESCE(s.balance, 0) AS savings_balance,
            COALESCE(w.balance, 0) AS wallet_balance,
            (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id) AS loans_count,
            (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status = 'active') AS active_loans
     FROM users u
     LEFT JOIN savings_accounts s ON s.user_id = u.id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.role = 'user' AND u.deleted_at IS NULL
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  res.json({ customers: rows });
}));

adminRouter.get("/customers/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.*, COALESCE(s.balance, 0) AS savings_balance, COALESCE(w.balance, 0) AS wallet_balance
     FROM users u
     LEFT JOIN savings_accounts s ON s.user_id = u.id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1 AND u.role = 'user'`,
    [req.params.id],
  );
  if (!rows[0]) throw new ApiError(404, "Customer not found");

  const { rows: loans } = await query(`SELECT * FROM loans WHERE user_id = $1 ORDER BY disbursed_at DESC`, [req.params.id]);
  const { rows: txns } = await query(`SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);

  res.json({ customer: rows[0], loans, transactions: txns });
}));
