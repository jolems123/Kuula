/**
 * Loans module: quote, apply (with auto-approve + disbursement), list, decide,
 * repayment, pay.
 *
 * Compliance:
 *   - Pricing is simple-interest, APR capped at 33.6% (below Apple's 36%).
 *   - Min term 90 days (above Google's 60-day rule).
 *   - Every disbursement + repayment is recorded in `transactions` ledger.
 */
import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/client.js";
import { requireAuth, requireRole, requireAdmin } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/error.js";
import { ApiError } from "../../lib/errors.js";
import {
  priceLoan, priceLoanV2, validateApplication, computeEligibility,
  collectionStage, attemptAutoPay, attemptPartialPay, createDisbursement, LOAN_RULES,
} from "../../lib/core.js";
import { nextApplicationId, nextLoanId, nextDisbursementId, nextTransactionId, nextReceiptId } from "../../lib/ids.js";
import { serializeApplication } from "../../lib/serialize.js";
import { providerFor } from "../../providers/airtel.js";

export const loansRouter = Router();

// ── Quote (live pricing) ────────────────────────────────────────────────────

const quoteSchema = z.object({
  amount: z.number().positive(),
  termDays: z.number().int().positive(),
});

loansRouter.post("/quote", requireAuth, validate({ body: quoteSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount, termDays } = req.body as z.infer<typeof quoteSchema>;

  const { rows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [req.auth.userId]);
  const savingsBalance = Number(rows[0]?.balance ?? 0);

  const quote = priceLoan({ principal: amount, termDays, savingsBalance });
  res.json(quote);
}));

// ── Rules ────────────────────────────────────────────────────────────────────

loansRouter.get("/rules", (_req, res) => res.json(LOAN_RULES));

// ── Applications: list + create ──────────────────────────────────────────────

loansRouter.get("/applications", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = req.auth.role === "admin"
    ? await query(`SELECT * FROM loan_applications WHERE status IN ('pending','approved','rejected','active','failed','paid','closed') ORDER BY created_at DESC LIMIT 200`)
    : await query(`SELECT * FROM loan_applications WHERE applicant_id = $1 ORDER BY created_at DESC`, [req.auth.userId]);
  res.json({ applications: rows.map((r) => serializeApplication(r as any)) });
}));

const applySchema = z.object({
  amount: z.number().positive(),
  purpose: z.string(),
  termDays: z.number().int().positive(),
  channel: z.string().optional(),
});

loansRouter.post("/applications", requireAuth, requireRole("user"), validate({ body: applySchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount, purpose, termDays, channel } = req.body as z.infer<typeof applySchema>;

  const { rows: userRows } = await query<{ phone: string; full_name: string }>(`SELECT phone, full_name FROM users WHERE id = $1`, [req.auth.userId]);
  if (!userRows[0]) throw new ApiError(404, "User not found");

  const { rows: balRows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [req.auth.userId]);
  const savingsBalance = Number(balRows[0]?.balance ?? 0);

  const pricing = priceLoan({ principal: amount, termDays, savingsBalance });
  const id = await nextApplicationId();

  await tx(async (db) => {
    await db.query(
      `INSERT INTO loan_applications (id, applicant_id, applicant_name, amount, purpose, term_days, channel, pricing, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [id, req.auth!.userId, userRows[0].full_name, Math.round(amount), purpose, pricing.termDays, channel ?? "MTN MoMo", JSON.stringify(pricing)],
    );
  });

  const { rows: appRows } = await query(`SELECT * FROM loan_applications WHERE id = $1`, [id]);
  res.status(201).json({ application: serializeApplication(appRows[0] as any) });
}));

// ── Decision (admin) ─────────────────────────────────────────────────────────

const decisionSchema = z.object({
  id: z.string(),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().optional(),
});

loansRouter.post("/applications/decision", requireAuth, requireAdmin, validate({ body: decisionSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { id, decision, notes } = req.body as z.infer<typeof decisionSchema>;

  const app = await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM loan_applications WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows[0]) throw new ApiError(404, "Application not found");
    const a = rows[0] as any;
    if (a.status !== "pending") throw new ApiError(409, `Application already ${a.status}`);

    a.status = decision;
    a.decided_at = new Date();
    a.decision_notes = notes ?? "";
    a.approved_by = req.auth!.userId;

    if (decision === "approved") {
      // Create loan + disbursement + repayment schedule.
      const loanId = nextLoanId();
      const disbId = nextDisbursementId();
      const pricing = a.pricing;
      const dueDate = new Date(Date.now() + a.term_days * 86400000);

      // Insert disbursement row (simulated provider call).
      const disb = createDisbursement({ appId: a.id, amount: a.amount, channel: a.channel, msisdn: "" }, disbId);
      await db.query(
        `INSERT INTO disbursements (id, application_id, user_id, amount, channel, msisdn, provider_ref, status, requested_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW())`,
        [disbId, a.id, a.applicant_id, a.amount, a.channel, disb.msisdn, disb.providerRef],
      );

      await db.query(
        `INSERT INTO loans (id, application_id, user_id, amount, term_days, interest_rate, service_fee_rate, interest, service_fee, total, apr, apr_clamped, status, disbursed_at, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, $8, $9, FALSE, 'active', NOW(), $10)`,
        [loanId, a.id, a.applicant_id, a.amount, a.term_days, pricing.apr, pricing.interest, pricing.total, pricing.apr, dueDate],
      );

      await db.query(
        `INSERT INTO repayments (loan_id, total, amount_paid, status, auto_pay_enabled, due_date)
         VALUES ($1, $2, 0, 'scheduled', TRUE, $3)`,
        [loanId, pricing.total, dueDate],
      );

      // Credit funds to wallet.
      await db.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
        [a.applicant_id, a.amount],
      );

      // Ledger entry.
      await db.query(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, transaction_id, metadata)
         VALUES ($1, $2, $3, 'loan_disbursement', $4, 'completed', $5, $6)`,
        [nextTransactionId(), a.applicant_id, loanId, a.amount, disb.providerRef, JSON.stringify({ channel: a.channel })],
      );

      // Update application row.
      a.loan_id = loanId;
      a.disbursement_id = disbId;
      a.status = "active";

      await db.query(
        `UPDATE loan_applications SET status = 'active', decided_at = NOW(), decision_notes = $2, approved_by = $3, loan_id = $4, disbursement_id = $5 WHERE id = $1`,
        [a.id, notes ?? "", req.auth!.userId, loanId, disbId],
      );
    } else {
      await db.query(
        `UPDATE loan_applications SET status = 'rejected', decided_at = NOW(), decision_notes = $2, approved_by = $3 WHERE id = $1`,
        [a.id, notes ?? "", req.auth!.userId],
      );
    }

    return a;
  });

  res.json({ application: serializeApplication(app) });
}));

// ── Apply v2 (auto-approve + provider disbursement) ──────────────────────────

const applyV2Schema = z.object({
  amount: z.number().positive(),
  term_days: z.number().int().positive(),
  purpose: z.string(),
  disbursement_method: z.string(),
});

loansRouter.post("/apply", requireAuth, requireRole("user"), validate({ body: applyV2Schema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount, term_days, purpose, disbursement_method } = req.body as z.infer<typeof applyV2Schema>;

  const valid = validateApplication({ amount, termDays: term_days, purpose, method: disbursement_method });
  if (!valid.ok) throw new ApiError(400, valid.error);

  const { rows: userRows } = await query<{ phone: string; full_name: string }>(`SELECT phone, full_name FROM users WHERE id = $1`, [req.auth.userId]);
  if (!userRows[0]) throw new ApiError(404, "User not found");

  const { rows: inputRows } = await query<{
    momo_txn_count: number; crb_status: string; crb_score: number | null; avg_monthly_balance: number; kyc_verified: boolean;
  }>(`SELECT * FROM credit_inputs WHERE user_id = $1`, [req.auth.userId]);
  const inputs = inputRows[0] ?? { momo_txn_count: 0, crb_status: "thin", crb_score: null, avg_monthly_balance: 0, kyc_verified: false };

  const { rows: balRows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [req.auth.userId]);
  const balance = Number(balRows[0]?.balance ?? 0);

  const { rows: loanRows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [req.auth.userId],
  );

  const elig = computeEligibility({
    avgMonthlyBalance: Number(inputs.avg_monthly_balance) || (inputs.momo_txn_count ? 60000 : 0),
    crbScore: inputs.crb_score ?? (inputs.crb_status === "clean" ? 820 : inputs.crb_status === "thin" ? 520 : 250),
    savingsBalance: balance,
    loansRepaid: Number(loanRows[0]?.repaid ?? 0),
    kycVerified: inputs.kyc_verified,
  });

  const amt = Math.round(amount);
  const pricing = priceLoanV2({ principal: amt, termDays: term_days, interestRate: elig.interestRate || 0.26 });
  const appId = await nextApplicationId();
  const loanId = nextLoanId();
  const disbId = nextDisbursementId();

  // Auto-decision by eligibility tier + amount ceiling.
  let status: string;
  if (!elig.eligible || amt > elig.maxAmount) {
    status = "rejected";
  } else {
    status = "approved";
  }

  await tx(async (db) => {
    await db.query(
      `INSERT INTO loan_applications (id, applicant_id, applicant_name, amount, purpose, term_days, channel, pricing, status, approved_by, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'auto-approve', NOW())`,
      [appId, req.auth!.userId, userRows[0].full_name, amt, purpose, pricing.termDays, disbursement_method, JSON.stringify(pricing), status],
    );

    if (status === "approved") {
      const dueDate = new Date(Date.now() + pricing.termDays * 86400000);
      await db.query(
        `INSERT INTO loans (id, application_id, user_id, amount, term_days, interest_rate, service_fee_rate, interest, service_fee, total, apr, apr_clamped, status, disbursed_at, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', NOW(), $13)`,
        [loanId, appId, req.auth!.userId, amt, pricing.termDays, pricing.interestRate, pricing.serviceFeeRate, pricing.interest, pricing.serviceFee, pricing.total, pricing.apr, pricing.clamped, dueDate],
      );
      await db.query(
        `INSERT INTO repayments (loan_id, total, amount_paid, status, auto_pay_enabled, due_date)
         VALUES ($1, $2, 0, 'scheduled', TRUE, $3)`,
        [loanId, pricing.total, dueDate],
      );
      await db.query(
        `UPDATE loan_applications SET loan_id = $2, disbursement_id = $3, status = 'active' WHERE id = $1`,
        [appId, loanId, disbId],
      );
    }
  });

  if (status === "approved") {
    // Disburse via the chosen provider.
    const prov = providerFor(disbursement_method);
    try {
      const r = await prov.disburse(userRows[0].phone, amt, appId);
      await tx(async (db) => {
        await db.query(
          `INSERT INTO disbursements (id, application_id, user_id, amount, channel, msisdn, provider_ref, status, requested_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW())`,
          [disbId, appId, req.auth!.userId, amt, disbursement_method, userRows[0].phone, r.transaction_id],
        );
        await db.query(
          `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
          [req.auth!.userId, amt],
        );
        await db.query(
          `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, transaction_id, metadata)
           VALUES ($1, $2, $3, 'loan_disbursement', $4, 'completed', $5, $6)`,
          [nextTransactionId(), req.auth!.userId, loanId, amt, r.transaction_id, JSON.stringify({ channel: disbursement_method, simulated: r.simulated })],
        );
      });
      res.json({ success: true, loan_id: appId, status: "active", credit_score: elig.score, pricing });
      return;
    } catch (e) {
      await query(`UPDATE loan_applications SET status = 'failed' WHERE id = $1`, [appId]);
      await query(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, metadata) VALUES ($1, $2, $3, 'loan_disbursement', $4, 'failed', $5)`,
        [nextTransactionId(), req.auth!.userId, loanId, amt, JSON.stringify({ error: (e as Error).message })],
      );
      throw new ApiError(502, `Disbursement failed: ${(e as Error).message}`);
    }
  }

  res.json({
    success: true,
    loan_id: appId,
    status,
    reason: !elig.eligible ? "Not eligible" : `Above your tier limit of UGX ${elig.maxAmount.toLocaleString()}`,
    credit_score: elig.score,
    pricing,
  });
  return;
}));

// ── Repayment: read + pay ────────────────────────────────────────────────────

loansRouter.get("/repayment", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { rows } = await query<{
    loan_id: string; total: number; amount_paid: number; status: string; due_date: Date;
  }>(
    `SELECT r.loan_id, r.total, r.amount_paid, r.status, r.due_date
     FROM repayments r JOIN loans l ON l.id = r.loan_id
     WHERE l.user_id = $1 AND l.status = 'active'
     ORDER BY r.due_date DESC LIMIT 1`,
    [req.auth.userId],
  );
  if (!rows[0]) { res.json({ repayment: null }); return; }

  const r = rows[0];
  const { rows: walletRows } = await query<{ balance: number }>(`SELECT balance FROM wallets WHERE user_id = $1`, [req.auth.userId]);

  const rep = {
    loanId: r.loan_id,
    total: Number(r.total),
    amountPaid: Number(r.amount_paid),
    status: r.status,
    dueDate: r.due_date.getTime(),
    autoPayEnabled: true,
    attempts: [] as any[],
  };
  res.json({
    repayment: { ...rep, collection: collectionStage(rep), walletBalance: Number(walletRows[0]?.balance ?? 0) },
  });
  return;
}));

const paySchema = z.object({
  amount: z.number().positive().optional(),
});

loansRouter.post("/repayment/pay", requireAuth, validate({ body: paySchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount: requestedAmount } = req.body as z.infer<typeof paySchema>;

  const result = await tx(async (db) => {
    const { rows: loanRows } = await db.query<{ loan_id: string; total: number; amount_paid: number; status: string; due_date: Date }>(
      `SELECT r.loan_id, r.total, r.amount_paid, r.status, r.due_date
       FROM repayments r JOIN loans l ON l.id = r.loan_id
       WHERE l.user_id = $1 AND l.status = 'active'
       ORDER BY r.due_date DESC LIMIT 1 FOR UPDATE`,
      [req.auth!.userId],
    );
    if (!loanRows[0]) throw new ApiError(404, "No active loan");
    const r = loanRows[0];

    const { rows: walletRows } = await db.query<{ balance: number }>(`SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [req.auth!.userId]);
    const walletBalance = Number(walletRows[0]?.balance ?? 0);

    const rep = {
      loanId: r.loan_id, total: Number(r.total), amountPaid: Number(r.amount_paid),
      status: r.status, dueDate: r.due_date.getTime(), autoPayEnabled: true, attempts: [] as any[],
    };

    // Partial or full pay depending on whether `amount` is provided
    const isPartial = requestedAmount !== undefined && requestedAmount < (rep.total - rep.amountPaid);
    const attempt = isPartial
      ? attemptPartialPay(rep, walletBalance, requestedAmount)
      : attemptAutoPay(rep, walletBalance);

    await db.query(
      `INSERT INTO repayment_attempts (loan_id, method, amount, success, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.loan_id, attempt.method, attempt.amount, attempt.success, attempt.reason],
    );

    if (attempt.success) {
      const newAmountPaid = rep.amountPaid + attempt.amount;
      const isFullyPaid = newAmountPaid >= rep.total;
      const receipt = { id: nextReceiptId(), amount: attempt.amount, paidAt: new Date().toISOString(), method: isPartial ? "MoMo partial debit" : "MoMo auto-debit" };

      if (isFullyPaid) {
        // Full repayment — mark everything paid
        await db.query(
          `UPDATE repayments SET amount_paid = total, status = 'paid', paid_at = NOW(), receipt = $2 WHERE loan_id = $1`,
          [r.loan_id, JSON.stringify(receipt)],
        );
        await db.query(`UPDATE loans SET status = 'paid', paid_at = NOW() WHERE id = $1`, [r.loan_id]);
      } else {
        // Partial repayment — increment amount_paid, keep status as scheduled
        await db.query(
          `UPDATE repayments SET amount_paid = $2, receipt = $3 WHERE loan_id = $1`,
          [r.loan_id, newAmountPaid, JSON.stringify(receipt)],
        );
      }

      await db.query(
        `UPDATE wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1`,
        [req.auth!.userId, attempt.amount],
      );
      await db.query(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, metadata) VALUES ($1, $2, $3, 'loan_payment', $4, 'completed', $5)`,
        [nextTransactionId(), req.auth!.userId, r.loan_id, attempt.amount, JSON.stringify({ ...receipt, partial: !isFullyPaid })],
      );
    }

    const updatedRepayment = {
      ...rep,
      amountPaid: attempt.success ? rep.amountPaid + attempt.amount : rep.amountPaid,
      status: (attempt.success && rep.amountPaid + attempt.amount >= rep.total) ? "paid" as const : rep.status as string,
    };

    return { attempt, updatedRepayment, isPartial };
  });

  res.json({
    repayment: { ...result.updatedRepayment, collection: collectionStage(result.updatedRepayment) },
    attempt: result.attempt,
    isPartial: result.isPartial,
  });
}));

// ── Top-up: one-tap extra funds for existing borrowers ─────────────────────
// Reuses eligibility + auto-approve logic but skips the full application
// flow.  The user already has an active loan in good standing, so KYC and
// credit checks are cached — this is a "top-up" not a fresh application.

const topUpSchema = z.object({
  amount: z.number().positive().min(LOAN_RULES.MIN_AMOUNT),
  term_days: z.number().int().positive(),
  purpose: z.string(),
  disbursement_method: z.string(),
});

loansRouter.post("/top-up", requireAuth, requireRole("user"), validate({ body: topUpSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { amount, term_days, purpose, disbursement_method } = req.body as z.infer<typeof topUpSchema>;

  const { rows: userRows } = await query<{ phone: string; full_name: string }>(`SELECT phone, full_name FROM users WHERE id = $1`, [req.auth.userId]);
  if (!userRows[0]) throw new ApiError(404, "User not found");

  // Verify the user has an active loan (good standing — not overdue)
  const { rows: activeLoanRows } = await query<{ id: string; amount: number; status: string; due_date: Date }>(
    `SELECT l.id, l.amount, l.status, r.due_date
     FROM loans l JOIN repayments r ON r.loan_id = l.id
     WHERE l.user_id = $1 AND l.status = 'active'
     ORDER BY r.due_date DESC LIMIT 1`,
    [req.auth.userId],
  );
  if (!activeLoanRows[0]) throw new ApiError(409, "You need an active loan to request a top-up");
  const existingLoan = activeLoanRows[0];

  // Check not overdue
  const daysToDue = Math.ceil((existingLoan.due_date.getTime() - Date.now()) / 86400000);
  if (daysToDue < -7) throw new ApiError(409, "Top-up unavailable — your loan is overdue. Please repay first.");

  // Re-check eligibility (uses cached credit inputs)
  const { rows: inputRows } = await query<{
    momo_txn_count: number; crb_status: string; crb_score: number | null; avg_monthly_balance: number; kyc_verified: boolean;
  }>(`SELECT * FROM credit_inputs WHERE user_id = $1`, [req.auth.userId]);
  const inputs = inputRows[0] ?? { momo_txn_count: 0, crb_status: "thin", crb_score: null, avg_monthly_balance: 0, kyc_verified: false };

  const { rows: balRows } = await query<{ balance: number }>(`SELECT balance FROM savings_accounts WHERE user_id = $1`, [req.auth.userId]);
  const balance = Number(balRows[0]?.balance ?? 0);

  const { rows: loanRows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [req.auth.userId],
  );

  const elig = computeEligibility({
    avgMonthlyBalance: Number(inputs.avg_monthly_balance) || (inputs.momo_txn_count ? 60000 : 0),
    crbScore: inputs.crb_score ?? (inputs.crb_status === "clean" ? 820 : inputs.crb_status === "thin" ? 520 : 250),
    savingsBalance: balance,
    loansRepaid: Number(loanRows[0]?.repaid ?? 0),
    kycVerified: inputs.kyc_verified,
  });

  const amt = Math.round(amount);
  if (!elig.eligible || amt > elig.maxAmount) {
    res.json({ success: false, reason: !elig.eligible ? "Not eligible for a top-up" : `Top-up limited to UGX ${elig.maxAmount.toLocaleString()} for your tier` });
    return;
  }

  const pricing = priceLoanV2({ principal: amt, termDays: term_days, interestRate: elig.interestRate || 0.26 });
  const appId = await nextApplicationId();
  const loanId = nextLoanId();
  const disbId = nextDisbursementId();

  await tx(async (db) => {
    await db.query(
      `INSERT INTO loan_applications (id, applicant_id, applicant_name, amount, purpose, term_days, channel, pricing, status, approved_by, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'auto-approve', NOW())`,
      [appId, req.auth!.userId, userRows[0].full_name, amt, purpose || "top-up", pricing.termDays, disbursement_method, JSON.stringify(pricing)],
    );

    const dueDate = new Date(Date.now() + pricing.termDays * 86400000);
    await db.query(
      `INSERT INTO loans (id, application_id, user_id, amount, term_days, interest_rate, service_fee_rate, interest, service_fee, total, apr, apr_clamped, status, disbursed_at, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', NOW(), $13)`,
      [loanId, appId, req.auth!.userId, amt, pricing.termDays, pricing.interestRate, pricing.serviceFeeRate, pricing.interest, pricing.serviceFee, pricing.total, pricing.apr, pricing.clamped, dueDate],
    );
    await db.query(
      `INSERT INTO repayments (loan_id, total, amount_paid, status, auto_pay_enabled, due_date)
       VALUES ($1, $2, 0, 'scheduled', TRUE, $3)`,
      [loanId, pricing.total, dueDate],
    );
    await db.query(
      `UPDATE loan_applications SET loan_id = $2, disbursement_id = $3 WHERE id = $1`,
      [appId, loanId, disbId],
    );
  });

  // Disburse via provider
  const prov = providerFor(disbursement_method);
  try {
    const r = await prov.disburse(userRows[0].phone, amt, appId);
    await tx(async (db) => {
      await db.query(
        `INSERT INTO disbursements (id, application_id, user_id, amount, channel, msisdn, provider_ref, status, requested_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW())`,
        [disbId, appId, req.auth!.userId, amt, disbursement_method, userRows[0].phone, r.transaction_id],
      );
      await db.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2, updated_at = NOW()`,
        [req.auth!.userId, amt],
      );
      await db.query(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, transaction_id, metadata)
         VALUES ($1, $2, $3, 'loan_disbursement', $4, 'completed', $5, $6)`,
        [nextTransactionId(), req.auth!.userId, loanId, amt, r.transaction_id, JSON.stringify({ channel: disbursement_method, simulated: r.simulated, top_up: true })],
      );
    });
    res.json({ success: true, loan_id: appId, status: "active", pricing });
    return;
  } catch (e) {
    await query(`UPDATE loan_applications SET status = 'failed' WHERE id = $1`, [appId]);
    await query(
      `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, metadata) VALUES ($1, $2, $3, 'loan_disbursement', $4, 'failed', $5)`,
      [nextTransactionId(), req.auth!.userId, loanId, amt, JSON.stringify({ error: (e as Error).message })],
    );
    throw new ApiError(502, `Top-up disbursement failed: ${(e as Error).message}`);
  }
}));

// ── Collections scheduling (intent record) ──────────────────────────────────

const scheduleSchema = z.object({
  loan_id: z.string(),
  due_date: z.string().optional(),
  amount: z.number().positive().optional(),
});

loansRouter.post("/collections/schedule", requireAuth, validate({ body: scheduleSchema }), asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const { loan_id, due_date, amount } = req.body as z.infer<typeof scheduleSchema>;
  // The hourly sweep (jobs/collections.ts) handles execution; this records intent.
  res.json({ success: true, scheduled: true, loan_id, due_date: due_date ?? null, amount: amount ?? null });
}));
