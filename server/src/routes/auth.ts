import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import type { UserRole } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { computeCreditScore } from "../lib/credit-score.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { issueOtp, verifyOtp, normalizePhone } from "../lib/otp.js";
import {
  issueSession,
  rotateSession,
  revokeSession,
  revokeAllSessions,
  REFRESH_COOKIE,
  refreshCookieOptions,
  type IssuedSession,
} from "../lib/sessions.js";
import { audit } from "../lib/audit.js";
import { IS_PRODUCTION } from "../lib/config.js";

const router = Router();

/**
 * Generic answer used for every "did that phone/email exist?" branch.
 * Requesting a code for an unknown number and for a known one must be
 * indistinguishable, or the endpoint becomes an account-enumeration oracle.
 */
const GENERIC_OTP_RESPONSE = {
  ok: true,
  message: "If that number is registered with Kuula, a verification code has been sent.",
};

async function buildSession(user: any) {
  const isAdmin = user.role === "admin";
  const savingsBalance = Number(user.savingsAccount?.balance ?? 0);

  let credit = null;
  if (!isAdmin) {
    credit = computeCreditScore({
      momoMonths: user.momoMonths ?? 0,
      momoTxnCount: user.momoTxnCount ?? 0,
      crbStatus: user.crbStatus ?? "thin",
      savingsBalance,
      kycVerified: user.kycVerified ?? false,
      loansRepaid: user.loansRepaid ?? 0,
      loansTotal: user.loansTotal ?? 0,
    });
  }

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    orderBy: { createdAt: "asc" },
  });

  let activeApp = null;
  let nextRep = null;
  if (!isAdmin) {
    activeApp = await prisma.loanApplication.findFirst({
      // `disbursing` is included so the borrower can see a payout in flight
      // instead of the app appearing to have lost their loan.
      where: { applicantId: user.id, status: { in: ["disbursing", "active", "overdue"] } },
      orderBy: { decidedAt: "desc" },
    });

    nextRep = await prisma.repayment.findFirst({
      where: { userId: user.id, status: { not: "paid" } },
      orderBy: { dueDate: "asc" },
    });
  }

  const scoreValue = credit?.score ?? 0;
  const tierLimit =
    scoreValue >= 750 ? 2000000 : scoreValue >= 700 ? 1000000 : scoreValue >= 600 ? 500000 : scoreValue >= 500 ? 200000 : 0;

  const userProfile = {
    id: user.id,
    role: user.role,
    initials:
      (user.fullName || "KU")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "KU",
    fullName: user.fullName,
    phone: user.phone ?? "",
    email: user.email,
    nationalId: user.nationalId ?? "",
    dateOfBirth: "",
    district: user.district ?? "",
    occupation: user.occupation ?? "",
    memberSince: user.createdAt,
    verified: user.verified,
    avatarUrl: null,
  };

  return {
    role: user.role,
    user: userProfile,
    credit,
    loan: isAdmin
      ? null
      : {
          availableCredit: activeApp ? 0 : tierLimit,
          creditIncreaseFromLastMonth: 0,
          totalLoansCount: user.loansTotal ?? 0,
          activeLoan: activeApp
            ? {
                id: activeApp.loanId || activeApp.id,
                amount: Number(activeApp.amount),
                repaidPercent: nextRep
                  ? Math.round(((Number(nextRep.amountPaid) ?? 0) / (Number(nextRep.total) || 1)) * 100)
                  : 0,
                status: activeApp.status,
                // Only a provider-confirmed disbursement has a disbursed date.
                disbursedDate: activeApp.disbursedAt
                  ? new Date(activeApp.disbursedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null,
              }
            : null,
          nextPayment: nextRep
            ? {
                amount: Number(nextRep.total) - Number(nextRep.amountPaid),
                dueDate: new Date(nextRep.dueDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
                daysLeft: Math.max(0, Math.ceil((new Date(nextRep.dueDate).getTime() - Date.now()) / 86400000)),
              }
            : null,
        },
    savingsBalance: isAdmin ? 0 : savingsBalance,
    messages: messages.map((m: any) => ({
      id: m.id,
      senderId: m.senderId,
      receiverId: m.receiverId,
      content: m.content,
      createdAt: m.createdAt,
      isRead: m.isRead,
    })),
    unreadNotifications: await prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  };
}

/**
 * Write the session to the response.
 *
 * Web clients get the refresh token as an httpOnly cookie (unreadable by JS,
 * so XSS cannot exfiltrate it). Native clients ask for it in the body via
 * `X-Client-Platform: native` and put it in the OS keystore. Web never receives
 * the refresh token in a JS-readable form.
 */
function attachSession(req: Request, res: Response, session: IssuedSession) {
  const isNative = String(req.headers["x-client-platform"] ?? "").toLowerCase() === "native";

  if (!isNative) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(session.refreshTokenExpiresAt));
  }

  return {
    token: session.accessToken,
    expiresIn: session.accessTokenExpiresIn,
    // Empty string on web: there is deliberately nothing for the browser to store.
    refreshToken: isNative ? session.refreshToken : "",
  };
}

function readRefreshToken(req: Request): string {
  const fromBody = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE] ?? "";
  return fromBody || fromCookie;
}

function deviceLabel(req: Request): string {
  return String(req.headers["user-agent"] ?? "unknown").slice(0, 120);
}

// ── Sign-up ────────────────────────────────────────────────────────────────
router.post("/signup", async (req: Request, res: Response) => {
  const { name, phone, email, password, nationalId, acceptedTerms, termsVersion } = req.body;
  if (!name?.trim() || !phone?.trim() || !password || !nationalId?.trim()) {
    throw new AppError("Name, phone, NIN, and password are required", 400);
  }
  if (!acceptedTerms) throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);
  if (String(password).length < 8) throw new AppError("Password must be at least 8 characters", 400);

  const normalizedNin = normalizeNin(String(nationalId));
  if (!isValidUgandaNin(normalizedNin)) {
    throw new AppError("A valid 14-character Uganda NIN is required", 400);
  }

  const normalizedPhone = normalizePhone(phone);
  if (!/^\+256\d{9}$/.test(normalizedPhone)) {
    throw new AppError("A valid Uganda phone number is required", 400);
  }

  const normalizedEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("A valid email address is required when email is provided", 400);
  }

  const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

  if (!existing) {
    const conflictingIdentity = await prisma.user.findFirst({
      where: {
        OR: [
          { nationalId: normalizedNin },
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
    });
    if (conflictingIdentity) {
      throw new AppError("An account already exists with these details. Please sign in or reset your password.", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        fullName: name.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        nationalId: normalizedNin,
        passwordHash,
        role: "user",
        phoneVerified: false,
        termsAcceptedAt: new Date(),
        termsVersion: typeof termsVersion === "string" ? termsVersion : null,
        savingsAccount: { create: { balance: 0 } },
      },
    });
    const issued = await issueOtp({ phone: normalizedPhone, purpose: "phone_verification", userId: user.id });
    if (!issued.ok) {
      const retryable = issued.reason === "cooldown" || issued.reason === "rate-limited";
      throw new AppError(
        retryable ? "Please wait before requesting another verification code." : "We could not send the verification SMS. Please try again.",
        retryable ? 429 : 503
      );
    }
  } else {
    // The number is taken. Answering "already registered" here would confirm
    // which numbers have Kuula accounts to anyone who asks, so we send a code
    // to the real owner instead and return the same shape either way.
    const issued = await issueOtp({ phone: normalizedPhone, purpose: "phone_verification", userId: existing.id });
    if (!issued.ok) {
      const retryable = issued.reason === "cooldown" || issued.reason === "rate-limited";
      throw new AppError(
        retryable ? "Please wait before requesting another verification code." : "We could not send the verification SMS. Please try again.",
        retryable ? 429 : 503
      );
    }
  }

  res.json({ ...GENERIC_OTP_RESPONSE, needsConfirmation: true });
});

// ── Login ──────────────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) throw new AppError("Phone and PIN are required", 400);

  const normalizedPhone = normalizePhone(phone);
  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    include: { savingsAccount: true },
  });

  // Same error for "no such user" and "wrong PIN".
  if (!user || !user.passwordHash || user.deletedAt) throw new AppError("Invalid phone number or PIN", 401);

  const valid = await bcrypt.compare(pin, user.passwordHash);
  if (!valid) throw new AppError("Invalid phone number or PIN", 401);

  const role = (user.role === "admin" ? "admin" : "user") as UserRole;
  const session = await issueSession({ userId: user.id, role, deviceLabel: deviceLabel(req) });
  const payload = await buildSession(user);

  await audit({ actorId: user.id, actorRole: role, action: "auth.login", entityType: "user", entityId: user.id });

  res.json({ ...attachSession(req, res, session), ...payload });
});

router.post("/admin-login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError("Email and password are required", 400);

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { savingsAccount: true },
  });
  if (!user || !user.passwordHash || user.role !== "admin" || user.deletedAt) {
    throw new AppError("Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError("Invalid credentials", 401);

  const session = await issueSession({ userId: user.id, role: "admin", deviceLabel: deviceLabel(req) });
  const payload = await buildSession(user);

  await audit({ actorId: user.id, actorRole: "admin", action: "auth.admin_login", entityType: "user", entityId: user.id });

  res.json({ ...attachSession(req, res, session), ...payload });
});

// ── Phone verification ─────────────────────────────────────────────────────
router.post("/verify-phone", async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone) throw new AppError("Phone number is required", 400);

  const normalizedPhone = normalizePhone(phone);
  const result = await verifyOtp({ phone: normalizedPhone, purpose: "phone_verification", code: String(code ?? "") });

  if (!result.ok) {
    // One message for every failure mode, so the response cannot be used to
    // probe which numbers have live challenges.
    const status = result.reason === "attempts-exceeded" ? 429 : 401;
    const message =
      result.reason === "attempts-exceeded"
        ? "Too many incorrect attempts. Request a new code."
        : "That code is invalid or has expired. Request a new one.";
    throw new AppError(message, status);
  }

  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    include: { savingsAccount: true },
  });
  if (!user || user.deletedAt) throw new AppError("That code is invalid or has expired. Request a new one.", 401);

  await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });

  const role = (user.role === "admin" ? "admin" : "user") as UserRole;
  const session = await issueSession({ userId: user.id, role, deviceLabel: deviceLabel(req) });
  const refreshed = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { savingsAccount: true },
  });
  const payload = await buildSession(refreshed);

  await audit({ actorId: user.id, actorRole: role, action: "auth.phone_verified", entityType: "user", entityId: user.id });

  res.json({ ...attachSession(req, res, session), ...payload });
});

router.post("/resend-otp", async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) throw new AppError("Phone number is required", 400);

  const normalizedPhone = normalizePhone(phone);
  const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

  if (user && !user.deletedAt) {
    const issued = await issueOtp({ phone: normalizedPhone, purpose: "phone_verification", userId: user.id });
    if (!issued.ok && (issued.reason === "cooldown" || issued.reason === "rate-limited")) {
      res.status(429).json({
        error: "Please wait before requesting another code.",
        retryAfterSec: issued.retryAfterSec,
      });
      return;
    }
  }

  // Unknown numbers get the same 200 and the same wording.
  res.json(GENERIC_OTP_RESPONSE);
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const { email, phone } = req.body;

  const user = email
    ? await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
    : phone
      ? await prisma.user.findUnique({ where: { phone: normalizePhone(String(phone)) } })
      : null;

  if (user?.phone && !user.deletedAt) {
    await issueOtp({
      phone: user.phone,
      purpose: "password_reset",
      userId: user.id,
      template: "Your Kuula password reset code is {code}. It expires in 5 minutes. Never share it.",
    });
  }

  res.json(GENERIC_OTP_RESPONSE);
});

// ── Session lifecycle ──────────────────────────────────────────────────────

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Called on app start (session restoration) and whenever the 15-minute access
 * token is about to expire.
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const raw = readRefreshToken(req);
  if (!raw) throw new AppError("Session expired. Please sign in again.", 401);

  const outcome = await rotateSession(raw, deviceLabel(req));
  if (!outcome.ok) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    if (outcome.reason === "reused") {
      // Every token in the family was just revoked. Say nothing about why.
      await audit({ action: "auth.refresh_reuse_detected", entityType: "session", entityId: "redacted" });
    }
    throw new AppError("Session expired. Please sign in again.", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: outcome.userId },
    include: { savingsAccount: true },
  });
  if (!user || user.deletedAt) throw new AppError("Session expired. Please sign in again.", 401);

  const payload = await buildSession(user);
  res.json({ ...attachSession(req, res, outcome.session), ...payload });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true },
  });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  const payload = await buildSession(user);
  res.json({ token: "", refreshToken: "", ...payload });
});

router.post("/signout", async (req: Request, res: Response) => {
  const raw = readRefreshToken(req);
  if (raw) await revokeSession(raw);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ ok: true });
});

/** Sign out everywhere — used after a password change or a security concern. */
router.post("/signout-all", authenticateToken, async (req: Request, res: Response) => {
  const revoked = await revokeAllSessions(req.user!.userId);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  await audit({
    actorId: req.user!.userId,
    action: "auth.signout_all",
    entityType: "user",
    entityId: req.user!.userId,
    metadata: { revoked },
  });
  res.json({ ok: true, revoked });
});

/**
 * Development-only helper so local/test flows can complete phone verification
 * without an SMS gateway. Returns 404 in production.
 */
router.post("/dev/last-otp", async (req: Request, res: Response) => {
  if (IS_PRODUCTION) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { sentMessages } = await import("../lib/sms.js");
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const last = [...sentMessages].reverse().find((m) => m.to === phone);
  res.json({ message: last?.body ?? null });
});

export default router;
