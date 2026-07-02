/**
 * Auth module: signup, login (customer PIN), admin login (email + password),
 * OTP verify, password reset, refresh, me, logout.
 *
 * Auth model:
 *   - Customer: phone + PIN (4–6 digits). PIN is argon2id-hashed.
 *   - Admin:    email + password. Password is argon2id-hashed.
 *   - Tokens:   short-lived access JWT (15min) + long-lived refresh JWT (30d).
 *               Refresh tokens are stored hashed in `refresh_tokens` and
 *               rotated on each use.
 */
import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/client.js";
import { hashPassword, verifyPassword, hashPin, verifyPin } from "../../lib/crypto.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken } from "../../lib/tokens.js";
import { ApiError } from "../../lib/errors.js";
import { nextUserId, numericOtp } from "../../lib/ids.js";
import { serializeUser, serializeCredit, serializeMessage } from "../../lib/serialize.js";
import type { SessionPayload, LoanProfile } from "../../lib/types.js";
import { COMPLIANCE, computeCreditScore } from "../../lib/core.js";
import { config } from "../../config.js";
import { asyncHandler } from "../../middleware/error.js";
import { validate } from "../../middleware/validate.js";
import { authLimiter, authSlowDown } from "../../middleware/rateLimit.js";
import { sendOtp } from "../../providers/otp.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

const normalizePhone = (p: string) => p.replace(/[\s-]/g, "");

function initialsFromName(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "KU";
}

/** Load the user's savings balance (0 if no row yet). */
async function savingsBalanceOf(userId: string): Promise<number> {
  const { rows } = await query<{ balance: string }>(
    `SELECT balance FROM savings_accounts WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ? Number(rows[0].balance) : 0;
}

/** Load credit inputs + computed score for the user. */
async function creditFor(userId: string) {
  const { rows } = await query<{
    momo_months: number; momo_txn_count: number; crb_status: string; kyc_verified: boolean;
  }>(
    `SELECT momo_months, momo_txn_count, crb_status, kyc_verified FROM credit_inputs WHERE user_id = $1`,
    [userId],
  );
  const inputs = rows[0] ?? { momo_months: 0, momo_txn_count: 0, crb_status: "thin", kyc_verified: false };
  const balance = await savingsBalanceOf(userId);

  // Loan history for repayment factor.
  const { rows: loanRows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [userId],
  );
  const loansTotal = Number(loanRows[0]?.total ?? 0);
  const loansRepaid = Number(loanRows[0]?.repaid ?? 0);

  return computeCreditScore({
    momoMonths: inputs.momo_months,
    momoTxnCount: inputs.momo_txn_count,
    crbStatus: inputs.crb_status as "clean" | "thin" | "adverse" | "unknown",
    savingsBalance: balance,
    kycVerified: inputs.kyc_verified,
    loansRepaid,
    loansTotal,
  });
}

/** Build the full SessionPayload for a freshly-authenticated user. */
async function sessionFor(userId: string, role: "user" | "admin"): Promise<SessionPayload> {
  const { rows: userRows } = await query(
    `SELECT id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, avatar_url
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (!userRows[0]) throw new ApiError(404, "User not found");
  const user = userRows[0] as any;

  const { rows: msgRows } = await query(
    `SELECT id, sender_id, receiver_id, content, is_read, created_at FROM messages
     WHERE sender_id = $1 OR receiver_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );

  const { rows: notifRows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM notifications WHERE user_id = $1 AND read = FALSE`,
    [userId],
  );

  // Issue access + refresh tokens. Refresh token row stores a hash.
  const access = signAccessToken(userId, role);
  const refresh = signRefreshToken(userId, "0");
  // Persist refresh token (jti=0 placeholder; we hash the JWT itself).
  const refreshHash = hashRefreshToken(refresh);
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { rows: refreshRows } = await query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id::text`,
    [userId, refreshHash, refreshExpiresAt],
  );
  // Re-sign the refresh token with the real jti (DB row id) so rotation works.
  const finalRefresh = signRefreshToken(userId, refreshRows[0].id);

  if (role === "user") {
    const score = await creditFor(userId);
    const savings = await savingsBalanceOf(userId);
    const loanProfile = await loanProfileFor(userId);

    return {
      token: access,
      refreshToken: finalRefresh,
      role,
      user: serializeUser(user),
      credit: serializeCredit({
        score: score.score,
        max_score: score.maxScore,
        tier: score.tier,
        percentile: score.percentile,
      }, 0),
      loan: loanProfile,
      savingsBalance: savings,
      messages: msgRows.map((m: any) => serializeMessage(m)),
      unreadNotifications: Number(notifRows[0]?.c ?? 0),
    };
  }

  // Admin: no credit, no loan, no savings.
  return {
    token: access,
    refreshToken: finalRefresh,
    role,
    user: serializeUser(user),
    credit: null,
    loan: null,
    savingsBalance: 0,
    messages: msgRows.map((m: any) => serializeMessage(m)),
    unreadNotifications: Number(notifRows[0]?.c ?? 0),
  };
}

/** Build the LoanProfile that the dashboard shows. */
async function loanProfileFor(userId: string): Promise<LoanProfile> {
  const { rows } = await query<{ total: string; repaid: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'paid')::text AS repaid FROM loans WHERE user_id = $1`,
    [userId],
  );
  const totalLoansCount = Number(rows[0]?.total ?? 0);

  const { rows: activeRows } = await query<{
    id: string; amount: number; total: number; amount_paid: number; status: string; disbursed_at: Date; due_date: Date;
  }>(
    `SELECT l.id, l.amount, l.total, r.amount_paid, l.status, l.disbursed_at, l.due_date
     FROM loans l JOIN repayments r ON r.loan_id = l.id
     WHERE l.user_id = $1 AND l.status = 'active'
     ORDER BY l.disbursed_at DESC LIMIT 1`,
    [userId],
  );

  let activeLoan: LoanProfile["activeLoan"] = null;
  let nextPayment: LoanProfile["nextPayment"] = null;

  if (activeRows[0]) {
    const a = activeRows[0];
    const repaidPercent = a.total > 0 ? Math.round((a.amount_paid / a.total) * 100) : 0;
    activeLoan = {
      id: a.id,
      amount: a.amount,
      repaidPercent,
      status: a.status,
      disbursedDate: a.disbursed_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    const daysLeft = Math.max(0, Math.ceil((a.due_date.getTime() - Date.now()) / 86400000));
    const outstanding = a.total - a.amount_paid;
    nextPayment = {
      amount: outstanding,
      dueDate: a.due_date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      daysLeft,
    };
  }

  // Available credit: flat 1,500,000 UGX for verified users (matches demo seed),
  // 0 for unverified. Replace with tier-based calculation in production.
  const { rows: userRows } = await query<{ verified: boolean }>(`SELECT verified FROM users WHERE id = $1`, [userId]);
  const availableCredit = userRows[0]?.verified ? 1_500_000 : 0;

  return {
    availableCredit,
    creditIncreaseFromLastMonth: 0,
    totalLoansCount,
    activeLoan,
    nextPayment,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

authRouter.use(authLimiter, authSlowDown);

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().regex(/^\+256\d{9}$/, "Phone must be in the format +256XXXXXXXXX"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  nationalId: z.string().regex(/^\d{10,12}$/, "National ID must be 10–12 digits"),
});

authRouter.post("/signup", validate({ body: signupSchema }), asyncHandler(async (req, res) => {
  const { name, phone, email, password, nationalId } = req.body as z.infer<typeof signupSchema>;

  // Uniqueness checks.
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM users WHERE (phone = $1 OR email = $2) AND deleted_at IS NULL LIMIT 1`,
    [normalizePhone(phone), email.toLowerCase()],
  );
  if (existing[0]) throw new ApiError(409, "An account with this phone number or email already exists");

  const userId = await nextUserId();
  const passwordHash = await hashPassword(password);
  const memberSince = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  await tx(async (db) => {
    await db.query(
      `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, password_hash, member_since, verified)
       VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8, FALSE)`,
      [userId, name, initialsFromName(name), normalizePhone(phone), email.toLowerCase(), nationalId, passwordHash, memberSince],
    );
    await db.query(
      `INSERT INTO credit_inputs (user_id, momo_months, momo_txn_count, crb_status, kyc_verified)
       VALUES ($1, 0, 0, 'thin', FALSE)`,
      [userId],
    );
    await db.query(
      `INSERT INTO savings_accounts (user_id, balance, interest_apr) VALUES ($1, 0, $2)`,
      [userId, COMPLIANCE.SAVINGS_APR],
    );
    await db.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`,
      [userId],
    );
  });

  // Send a signup OTP.
  const code = numericOtp(config.otp.length);
  const codeHash = await hashPin(code);
  const expiresAt = new Date(Date.now() + config.otp.ttlMs);
  await query(
    `INSERT INTO otp_codes (key, code_hash, purpose, expires_at) VALUES ($1, $2, 'signup', $3)`,
    [normalizePhone(phone), codeHash, expiresAt],
  );
  await sendOtp(normalizePhone(phone), code, "signup");

  // Provisional access token so the client can call /verify-otp without re-logging in.
  const access = signAccessToken(userId, "user");
  res.status(201).json({
    ok: true,
    needsConfirmation: true,
    token: access,
    ...(config.otp.debug ? { debugOtp: code } : {}),
  });
}));

const loginSchema = z.object({
  phone: z.string(),
  pin: z.string(),
});

authRouter.post("/login", validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const { phone, pin } = req.body as z.infer<typeof loginSchema>;
  const normalized = normalizePhone(phone);

  const { rows } = await query<{ id: string; pin_hash: string; deleted_at: string | null }>(
    `SELECT id, pin_hash, deleted_at FROM users WHERE role = 'user' AND phone = $1`,
    [normalized],
  );
  const user = rows[0];
  if (!user || user.deleted_at || !user.pin_hash) {
    throw new ApiError(401, "Invalid phone number or PIN");
  }
  const ok = await verifyPin(user.pin_hash, String(pin));
  if (!ok) throw new ApiError(401, "Invalid phone number or PIN");

  const session = await sessionFor(user.id, "user");
  res.json(session);
}));

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/admin-login", validate({ body: adminLoginSchema }), asyncHandler(async (req, res) => {
  const { email, password } = req.body as z.infer<typeof adminLoginSchema>;
  const { rows } = await query<{ id: string; password_hash: string; deleted_at: string | null }>(
    `SELECT id, password_hash, deleted_at FROM users WHERE role = 'admin' AND email = $1`,
    [email.toLowerCase().trim()],
  );
  const admin = rows[0];
  if (!admin || admin.deleted_at || !admin.password_hash) {
    throw new ApiError(401, "Invalid credentials");
  }
  const ok = await verifyPassword(admin.password_hash, String(password));
  if (!ok) throw new ApiError(401, "Invalid credentials");

  const session = await sessionFor(admin.id, "admin");
  res.json(session);
}));

const verifyOtpSchema = z.object({ code: z.string().regex(/^\d{4,8}$/) });

authRouter.post("/verify-otp", requireAuth, validate({ body: verifyOtpSchema }), asyncHandler(async (req, res) => {
  const { code } = req.body as z.infer<typeof verifyOtpSchema>;
  if (!req.auth) throw new ApiError(401, "Authentication required");

  // The "key" for OTP lookup is the user's phone.
  const { rows: userRows } = await query<{ phone: string }>(`SELECT phone FROM users WHERE id = $1`, [req.auth.userId]);
  if (!userRows[0]) throw new ApiError(404, "User not found");
  const key = userRows[0].phone;

  const { rows: otpRows } = await query<{ id: string; code_hash: string; expires_at: Date; used_at: Date | null; attempts: number }>(
    `SELECT id, code_hash, expires_at, used_at, attempts FROM otp_codes
     WHERE key = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [key],
  );
  const otp = otpRows[0];
  if (!otp) throw new ApiError(400, "No active OTP — request a new one");
  if (otp.attempts >= 5) throw new ApiError(429, "Too many attempts — request a new code");

  const ok = await verifyPin(otp.code_hash, code);
  if (!ok) {
    await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
    throw new ApiError(400, "Invalid code");
  }

  await tx(async (db) => {
    await db.query(`UPDATE otp_codes SET used_at = NOW() WHERE id = $1`, [otp.id]);
    // Mark the user as verified on first successful OTP.
    await db.query(`UPDATE users SET verified = TRUE, kyc_status = 'verified', kyc_verified_at = NOW() WHERE id = $1`, [req.auth!.userId]);
    await db.query(`UPDATE credit_inputs SET kyc_verified = TRUE WHERE user_id = $1`, [req.auth!.userId]);
  });

  res.json({ ok: true });
}));

const resetPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/reset-password", validate({ body: resetPasswordSchema }), asyncHandler(async (req, res) => {
  const { email } = req.body as z.infer<typeof resetPasswordSchema>;
  // Always return 200 to avoid account enumeration.
  const { rows } = await query<{ id: string; phone: string }>(
    `SELECT id, phone FROM users WHERE email = $1 AND deleted_at IS NULL`, [email.toLowerCase()],
  );
  if (rows[0]) {
    const code = numericOtp(config.otp.length);
    const codeHash = await hashPin(code);
    await query(
      `INSERT INTO otp_codes (key, code_hash, purpose, expires_at) VALUES ($1, $2, 'reset', $3)`,
      [rows[0].phone, codeHash, new Date(Date.now() + config.otp.ttlMs)],
    );
    await sendOtp(rows[0].phone, code, "password reset");
  }
  res.json({ ok: true });
}));

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post("/refresh", validate({ body: refreshSchema }), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  try {
    verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const hash = hashRefreshToken(refreshToken);
  const { rows } = await query<{ id: string; user_id: string; role: "user" | "admin"; revoked_at: Date | null; expires_at: Date }>(
    `SELECT rt.id, rt.user_id, u.role, rt.revoked_at, rt.expires_at
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.expires_at < new Date()) {
    throw new ApiError(401, "Refresh token no longer valid");
  }

  // Rotate: revoke the old, issue a new pair.
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  const session = await sessionFor(row.user_id, row.role);
  res.json(session);
}));

authRouter.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  // Revoke all of the user's refresh tokens (paranoid logout).
  if (req.auth) {
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [req.auth.userId]);
  }
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth) throw new ApiError(401, "Authentication required");
  const session = await sessionFor(req.auth.userId, req.auth.role);
  res.json(session);
}));

// Health check is mounted on the auth router for legacy compat with the
// frontend's api.health() call.
authRouter.get("/health", (_req, res) => res.json({ ok: true }));
