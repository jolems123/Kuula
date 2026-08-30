import { Router, Request, Response } from "express";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import {
  authenticateToken,
  generateAdminChallenge,
  generateToken,
  normalizeRole,
  verifyAdminChallenge,
} from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { computeCreditScore } from "../lib/credit-score.js";
import { effectiveCreditEvidence } from "../lib/credit-evidence.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
import {
  createAuthSession,
  revokeAllAuthSessions,
  revokeAuthSession,
  rotateRefreshSession,
} from "../lib/sessions.js";
import {
  generateOtpCode,
  hashOtp,
  otpExpiry,
  otpLockExpiry,
  OTP_POLICY,
  validateNewPassword,
  verifyOtpHash,
  type OtpPurpose,
} from "../lib/otp.js";
import { sendOtpSms, smsConfigured } from "../lib/sms.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
const STAFF_ROLES = new Set(["admin", "manager", "officer"]);

function normalizedPhone(value: unknown): string {
  try {
    return normalizeUgandaMobileMoneyPhone(String(value ?? ""));
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid phone number", 400);
  }
}

function normalizedEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Enter a valid email address", 400);
  }
  return email;
}

function password(value: unknown): string {
  try {
    return validateNewPassword(value);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid password", 400);
  }
}

function tokenFor(user: Pick<User, "id" | "role" | "authVersion">, sessionId: string): string {
  return generateToken({
    userId: user.id,
    role: normalizeRole(user.role),
    authVersion: user.authVersion,
    sessionId,
  });
}

function cooldownSeconds(lastSentAt: Date | null, now = new Date()): number {
  if (!lastSentAt) return 0;
  const elapsed = now.getTime() - lastSentAt.getTime();
  return Math.max(0, Math.ceil((OTP_POLICY.resendCooldownSeconds * 1000 - elapsed) / 1000));
}

async function issueOtp(user: User, purpose: OtpPurpose): Promise<void> {
  if (!smsConfigured()) throw new AppError("SMS verification is temporarily unavailable", 503);

  const now = new Date();
  if (user.otpLockedUntil && user.otpLockedUntil > now) {
    const seconds = Math.ceil((user.otpLockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(`Verification is locked. Try again in ${seconds} seconds.`, 429);
  }

  const retryAfter = cooldownSeconds(user.otpLastSentAt, now);
  if (retryAfter > 0) throw new AppError(`Wait ${retryAfter} seconds before requesting another code.`, 429);
  if (!user.phone) throw new AppError("A verified staff phone number is required for verification", 422);

  const code = generateOtpCode();
  const otpHash = hashOtp(user.id, purpose, code);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpHash,
      otpPurpose: purpose,
      otpExpiresAt: otpExpiry(now),
      otpAttempts: 0,
      otpLastSentAt: now,
      otpLockedUntil: null,
    },
  });

  try {
    const result = await sendOtpSms(user.phone, code, purpose);
    if (!result.accepted) throw new Error(result.detail || "SMS provider rejected the message");
  } catch (error) {
    await prisma.user.updateMany({
      where: { id: user.id, otpHash },
      // A provider failure must not start the resend cooldown. The customer
      // should be able to retry as soon as delivery is available again.
      data: { otpHash: null, otpPurpose: null, otpExpiresAt: null, otpLastSentAt: null },
    });
    console.error(JSON.stringify({
      event: "otp.delivery_failed",
      userId: user.id,
      purpose,
      error: error instanceof Error ? error.message : "Unknown SMS provider error",
    }));
    throw new AppError("Could not send the verification message. Try again later.", 503);
  }
}

async function assertOtp(user: User, purpose: OtpPurpose, code: unknown): Promise<void> {
  const supplied = typeof code === "string" ? code.trim() : "";
  if (!/^\d{6}$/.test(supplied)) throw new AppError("Enter the 6-digit code", 400);

  const now = new Date();
  if (user.otpLockedUntil && user.otpLockedUntil > now) {
    const seconds = Math.ceil((user.otpLockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(`Too many incorrect codes. Try again in ${seconds} seconds.`, 429);
  }

  if (
    user.otpPurpose !== purpose
    || !user.otpExpiresAt
    || user.otpExpiresAt < now
    || !verifyOtpHash(user.otpHash, user.id, purpose, supplied)
  ) {
    const attempts = (user.otpAttempts || 0) + 1;
    const locked = attempts >= OTP_POLICY.maxAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpAttempts: locked ? 0 : attempts,
        otpLockedUntil: locked ? otpLockExpiry(now) : null,
        ...(locked ? { otpHash: null, otpPurpose: null, otpExpiresAt: null } : {}),
      },
    });
    throw new AppError(locked ? "Too many incorrect codes. Request a new code later." : "Invalid or expired code", locked ? 429 : 401);
  }
}

const clearOtp = {
  otpHash: null,
  otpPurpose: null,
  otpExpiresAt: null,
  otpAttempts: 0,
  otpLockedUntil: null,
} as const;

async function buildSession(user: any) {
  const role = normalizeRole(user.role);
  const isStaff = STAFF_ROLES.has(role);
  const evidence = isStaff ? null : await effectiveCreditEvidence(user.id);
  const credit = isStaff ? null : computeCreditScore({
    momoMonths: evidence?.momoMonths ?? 0,
    momoTxnCount: evidence?.momoTxnCount ?? 0,
    crbStatus: evidence?.crbStatus ?? "thin",
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  });

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const activeApp = isStaff ? null : await prisma.loanApplication.findFirst({
    where: { applicantId: user.id, status: { in: ["active", "overdue"] } },
    orderBy: { decidedAt: "desc" },
  });
  const nextRep = isStaff ? null : await prisma.repayment.findFirst({
    where: { userId: user.id, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  const scoreValue = credit?.score ?? 0;
  const evidenceReady = !!evidence?.momoVerified && !!evidence?.crbVerified && !!user.kycVerified;
  const tierLimit = !evidenceReady ? 0 : scoreValue >= 750 ? 2_000_000 : scoreValue >= 700 ? 1_000_000 : scoreValue >= 600 ? 500_000 : scoreValue >= 500 ? 200_000 : 0;

  return {
    role,
    user: {
      id: user.id,
      role,
      initials: (user.fullName || "KU").split(" ").map((word: string) => word[0]).join("").slice(0, 2).toUpperCase() || "KU",
      fullName: user.fullName,
      phone: user.phone ?? "",
      email: user.email,
      nationalId: user.nationalId ?? "",
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : "",
      district: user.district ?? "",
      occupation: user.occupation ?? "",
      memberSince: user.createdAt,
      verified: user.verified,
      avatarUrl: null,
    },
    credit,
    loan: isStaff ? null : {
      availableCredit: activeApp ? 0 : tierLimit,
      creditIncreaseFromLastMonth: 0,
      totalLoansCount: user.loansTotal ?? 0,
      activeLoan: activeApp ? {
        id: activeApp.loanId || activeApp.id,
        amount: Number(activeApp.amount),
        repaidPercent: nextRep ? Math.round((Number(nextRep.amountPaid) / Math.max(Number(nextRep.total), 1)) * 100) : 0,
        status: activeApp.status,
        disbursedDate: new Date(activeApp.decidedAt || activeApp.createdAt).toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" }),
      } : null,
      nextPayment: nextRep ? {
        amount: Number(nextRep.total) - Number(nextRep.amountPaid),
        dueDate: new Date(nextRep.dueDate).toLocaleDateString("en-UG", { month: "short", day: "numeric", year: "numeric" }),
        daysLeft: Math.max(0, Math.ceil((new Date(nextRep.dueDate).getTime() - Date.now()) / 86_400_000)),
      } : null,
    },
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      createdAt: message.createdAt,
      isRead: message.isRead,
    })),
    unreadNotifications: await prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  };
}

async function sessionResponse(user: any, req: Request) {
  const { session, refreshToken } = await createAuthSession(user.id, req.headers["user-agent"]);
  return {
    token: tokenFor(user, session.id),
    refreshToken,
    accessExpiresInSeconds: 15 * 60,
    ...await buildSession(user),
  };
}

router.post("/signup", async (req: Request, res: Response) => {
  const { name, nationalId, acceptedTerms, termsVersion } = req.body;
  const phone = normalizedPhone(req.body.phone);
  const email = normalizedEmail(req.body.email);
  const newPassword = password(req.body.password);
  const fullName = typeof name === "string" ? name.trim() : "";

  if (!fullName) throw new AppError("Name is required", 400);
  if (fullName.length > 120) throw new AppError("Name must be 120 characters or fewer", 400);
  if (!acceptedTerms) throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);
  const normalizedNin = nationalId ? normalizeNin(String(nationalId)) : "";
  if (!isValidUgandaNin(normalizedNin)) throw new AppError("A valid 14-character Uganda NIN is required", 400);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : []), { nationalId: normalizedNin }] },
  });
  if (existing) {
    // A failed first delivery leaves a deliberately unverified account behind.
    // Let the owner retry signup with the same phone; never replace credentials
    // or identity data from this unauthenticated request.
    if (existing.phone === phone && !existing.phoneVerified && !existing.deletedAt) {
      await issueOtp(existing, "phone_verify");
      res.status(201).json({ ok: true, needsConfirmation: true });
      return;
    }
    throw new AppError("Phone, email, or NIN already registered", 409);
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      phone,
      email,
      nationalId: normalizedNin || null,
      passwordHash: await bcrypt.hash(newPassword, 12),
      role: "user",
      phoneVerified: false,
      termsAcceptedAt: new Date(),
      termsVersion: typeof termsVersion === "string" ? termsVersion : null,
      wallet: { create: { balance: 0 } },
    },
  });

  await issueOtp(user, "phone_verify");
  res.status(201).json({ ok: true, needsConfirmation: true });
});

router.post("/login", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const pin = typeof req.body.pin === "string" ? req.body.pin : "";
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.passwordHash || user.deletedAt) throw new AppError("Invalid phone number or PIN", 401);
  if (!user.phoneVerified) throw new AppError("Verify your phone before signing in", 403);
  if (!await bcrypt.compare(pin, user.passwordHash)) throw new AppError("Invalid phone number or PIN", 401);

  await writeAuditEvent({ actorId: user.id, subjectUserId: user.id, action: "auth.login", resourceType: "auth_session" });
  res.json(await sessionResponse(user, req));
});

router.post("/admin-login", async (req: Request, res: Response) => {
  const email = normalizedEmail(req.body.email);
  const supplied = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !supplied) throw new AppError("Email and password are required", 400);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !STAFF_ROLES.has(user.role) || user.deletedAt) throw new AppError("Invalid credentials", 401);
  if (!await bcrypt.compare(supplied, user.passwordHash)) throw new AppError("Invalid credentials", 401);

  if (process.env.NODE_ENV === "test") {
    res.json(await sessionResponse(user, req));
    return;
  }
  if (!user.phone || !user.phoneVerified) throw new AppError("Staff MFA requires a verified phone number", 403);

  await issueOtp(user, "admin_login");
  const challengeToken = generateAdminChallenge({ userId: user.id, authVersion: user.authVersion });
  await writeAuditEvent({ actorId: user.id, subjectUserId: user.id, action: "auth.admin_mfa_challenge", resourceType: "user", resourceId: user.id });
  res.json({
    requiresMfa: true,
    challengeToken,
    destination: `${user.phone.slice(0, 4)}••••${user.phone.slice(-3)}`,
  });
});

router.post("/admin-login/verify", async (req: Request, res: Response) => {
  const challengeToken = typeof req.body.challengeToken === "string" ? req.body.challengeToken : "";
  const challenge = verifyAdminChallenge(challengeToken);
  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || user.deletedAt || !STAFF_ROLES.has(user.role) || user.authVersion !== challenge.authVersion) {
    throw new AppError("Admin verification challenge is no longer valid", 401);
  }
  await assertOtp(user, "admin_login", req.body.code);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { ...clearOtp } });
  await writeAuditEvent({ actorId: user.id, subjectUserId: user.id, action: "auth.admin_mfa_verified", resourceType: "user", resourceId: user.id });
  res.json(await sessionResponse(updated, req));
});

router.post("/admin-login/resend", async (req: Request, res: Response) => {
  const challengeToken = typeof req.body.challengeToken === "string" ? req.body.challengeToken : "";
  const challenge = verifyAdminChallenge(challengeToken);
  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || user.deletedAt || !STAFF_ROLES.has(user.role) || user.authVersion !== challenge.authVersion) {
    throw new AppError("Admin verification challenge is no longer valid", 401);
  }
  await issueOtp(user, "admin_login");
  res.json({ ok: true });
});

router.post("/verify-phone", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.deletedAt) throw new AppError("Invalid or expired code", 401);
  if (user.phoneVerified) throw new AppError("Phone number is already verified", 409);

  await assertOtp(user, "phone_verify", req.body.code);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerified: true, ...clearOtp },
  });
  res.json(await sessionResponse(updated, req));
});

router.post("/resend-otp", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.deletedAt || user.phoneVerified) {
    res.json({ ok: true });
    return;
  }
  await issueOtp(user, "phone_verify");
  res.json({ ok: true });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  if (!smsConfigured()) throw new AppError("SMS verification is temporarily unavailable", 503);
  const identifier = String(req.body.identifier ?? req.body.email ?? req.body.phone ?? "").trim();
  if (!identifier) throw new AppError("Enter your phone number or email address", 400);

  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: normalizedEmail(identifier)! } })
    : await prisma.user.findUnique({ where: { phone: normalizedPhone(identifier) } });

  if (user && !user.deletedAt && user.phoneVerified && user.phone) await issueOtp(user, "password_reset");
  res.json({ ok: true, message: "If the account is eligible, a reset code was sent to its verified phone." });
});

router.post("/reset-password/confirm", async (req: Request, res: Response) => {
  const identifier = String(req.body.identifier ?? "").trim();
  if (!identifier) throw new AppError("Enter your phone number or email address", 400);
  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: normalizedEmail(identifier)! } })
    : await prisma.user.findUnique({ where: { phone: normalizedPhone(identifier) } });
  if (!user || user.deletedAt || !user.phoneVerified) throw new AppError("Invalid or expired code", 401);

  await assertOtp(user, "password_reset", req.body.code);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password(req.body.newPassword), 12), authVersion: { increment: 1 }, ...clearOtp },
    }),
    prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAuditEvent({ subjectUserId: user.id, action: "auth.password_reset", resourceType: "user", resourceId: user.id });
  res.json({ ok: true, message: "Password updated. Sign in with your new password." });
});

router.post("/refresh", async (req: Request, res: Response) => {
  const raw = typeof req.body.refreshToken === "string" ? req.body.refreshToken : "";
  const rotated = await rotateRefreshSession(raw, req.headers["user-agent"]);
  if (!rotated) throw new AppError("Refresh session is invalid or expired", 401);
  res.json({
    token: tokenFor(rotated.user, rotated.session.id),
    refreshToken: rotated.refreshToken,
    accessExpiresInSeconds: 15 * 60,
  });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  res.json({ token: req.headers.authorization?.slice(7) || "", refreshToken: "", accessExpiresInSeconds: 15 * 60, ...await buildSession(user) });
});

router.post("/signout", authenticateToken, async (req: Request, res: Response) => {
  await revokeAuthSession(req.user!.sessionId, req.user!.userId);
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: req.user!.userId, action: "auth.logout", resourceType: "auth_session", resourceId: req.user!.sessionId });
  res.json({ ok: true });
});

router.post("/signout-all", authenticateToken, async (req: Request, res: Response) => {
  await prisma.user.update({ where: { id: req.user!.userId }, data: { authVersion: { increment: 1 } } });
  await revokeAllAuthSessions(req.user!.userId);
  await writeAuditEvent({ actorId: req.user!.userId, subjectUserId: req.user!.userId, action: "auth.logout_all", resourceType: "user", resourceId: req.user!.userId });
  res.json({ ok: true });
});

export default router;
