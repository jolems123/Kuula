/**
 * Credit module: live credit score + 0–100 eligibility score.
 */
import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/client.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import { computeCreditScore, computeEligibility } from "../../lib/core.js";

export const creditRouter = Router();

creditRouter.get("/score", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  // Admins can request ?userId=… to look up a customer.
  const targetId = req.auth.role === "admin"
    ? String((req.query as { userId?: string }).userId ?? req.auth.userId)
    : req.auth.userId;

  const { rows: inputRows } = await query<{
    momo_months: number; momo_txn_count: number; crb_status: string; crb_score: number | null; avg_monthly_balance: number; kyc_verified: boolean;
  }>(
    `SELECT momo_months, momo_txn_count, crb_status, crb_score, avg_monthly_balance, kyc_verified FROM credit_inputs WHERE user_id = $1`,
    [targetId],
  );
  const inputs = inputRows[0] ?? { momo_months: 0, momo_txn_count: 0, crb_status: "thin", crb_score: null, avg_monthly_balance: 0, kyc_verified: false };

  const { rows: balRows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [targetId]);
  const balance = Number(balRows[0]?.balance ?? 0);

  const { rows: loanRows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [targetId],
  );
  const loansTotal = Number(loanRows[0]?.total ?? 0);
  const loansRepaid = Number(loanRows[0]?.repaid ?? 0);

  const score = computeCreditScore({
    momoMonths: inputs.momo_months,
    momoTxnCount: inputs.momo_txn_count,
    crbStatus: inputs.crb_status as "clean" | "thin" | "adverse" | "unknown",
    savingsBalance: balance,
    kycVerified: inputs.kyc_verified,
    loansRepaid,
    loansTotal,
  });

  // Persist a snapshot for history (no await — fire and forget).
  query(
    `INSERT INTO credit_score_history (user_id, score, max_score, tier, percentile, factors) VALUES ($1, $2, $3, $4, $5, $6)`,
    [targetId, score.score, score.maxScore, score.tier, score.percentile, JSON.stringify(score.factors)],
  ).catch(() => {});

  res.json(score);
}));

const calcSchema = z.object({ user_id: z.string().optional() });

creditRouter.post("/calculate", requireAuth, validate({ body: calcSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const body = req.body as z.infer<typeof calcSchema>;
  const targetId = req.auth.role === "admin" && body.user_id ? body.user_id : req.auth.userId;

  const { rows: inputRows } = await query<{
    momo_months: number; momo_txn_count: number; crb_status: string; crb_score: number | null; avg_monthly_balance: number; kyc_verified: boolean;
  }>(
    `SELECT momo_months, momo_txn_count, crb_status, crb_score, avg_monthly_balance, kyc_verified FROM credit_inputs WHERE user_id = $1`,
    [targetId],
  );
  const inputs = inputRows[0];
  if (!inputs) throw new ApiError(404, "Credit inputs not found for this user");

  const { rows: balRows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [targetId]);
  const balance = Number(balRows[0]?.balance ?? 0);

  const { rows: loanRows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [targetId],
  );

  const elig = computeEligibility({
    avgMonthlyBalance: Number(inputs.avg_monthly_balance) || (inputs.momo_txn_count ? 60000 : 0),
    crbScore: inputs.crb_score ?? (inputs.crb_status === "clean" ? 820 : inputs.crb_status === "thin" ? 520 : 250),
    savingsBalance: balance,
    loansRepaid: Number(loanRows[0]?.repaid ?? 0),
    kycVerified: inputs.kyc_verified,
  });

  res.json({
    credit_score: elig.score,
    eligible: elig.eligible,
    max_amount: elig.maxAmount,
    interest_rate: elig.interestRate,
    tier: elig.tier,
    breakdown: elig.breakdown,
  });
}));
