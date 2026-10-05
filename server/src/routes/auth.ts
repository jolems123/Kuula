import { Router, Request, Response } from "express";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import {
  authenticateToken,
  generateAdminChallenge,
  generateToken,
  isStaffRole,
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
  otpLockExpiry,
  OTP_POLICY,
  LOGIN_PIN_PATTERN,
  validateNewPassword,
  validateNewPin,
  verifyOtpHash,
  type OtpPurpose,
} from "../lib/otp.js";
import { issueOtpForUser } from "../lib/otp-service.js";
import { smsConfigured } from "../lib/sms.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();

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

function loginPin(value: unknown): string {
  try {
    return validateNewPin(value);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid PIN", 400);
  }
}

const LOGIN_POLICY = { maxAttempts: 5, lockMinutes: 15 } as const;

/**
 * Check a customer's PIN or backup password. A four-digit PIN is guessable, so
 * failures are counted per account and the account pauses after a few misses.
 */
async function assertLoginSecret(user: User, supplied: string): Promise<void> {
  const now = new Date();
  if (user.loginLockedUntil && user.loginLockedUntil > now) {
    const minutes = Math.ceil((user.loginLockedUntil.getTime() - now.getTime()) / 60_000);
    throw new AppError(`Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your PIN.`, 429);
  }

  const asPin = LOGIN_PIN_PATTERN.test(supplied) && !!user.pinHash && await bcrypt.compare(supplied, user.pinHash);
  const asPassword = !asPin && !!user.passwordHash && await bcrypt.compare(supplied, user.passwordHash);
  if (asPin || asPassword) {
    if (user.loginAttempts || user.loginLockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, loginLockedUntil: null } });
    }
    return;
  }

  const attempts = user.loginAttempts + 1;
  const locked = attempts >= LOGIN_POLICY.maxAttempts;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: locked ? 0 : attempts,
      loginLockedUntil: locked ? new Date(now.getTime() + LOGIN_POLICY.lockMinutes * 60_000) : null,
    },
  });
  if (locked) throw new AppError(`Too many wrong attempts. Try again in ${LOGIN_POLICY.lockMinutes} minutes, or reset your PIN.`, 429);
  throw new AppError("Wrong phone number or PIN", 401);
}

function tokenFor(user: Pick<User, "id" | "role" | "authVersion">, sessionId: string): string {
  return generateToken({
    userId: user.id,
    role: normalizeRole(user.role),
    authVersion: user.authVersion,
    sessionId,
  });
}

// OTP issuance lives in lib/otp-service so the staff invitation router shares
// the exact same delivery, cooldown, and failure-rollback behaviour.
const issueOtp = issueOtpForUser;

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
  const isStaff = isStaffRole(role);
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
      hasPin: !!user.pinHash,
      hasPassword: !!user.passwordHash,
      nationalId: user.nationalId ?? "",
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : "",
      district: user.district ?? "",
      occupation: user.occupation ?? "",
      physicalAddress: user.physicalAddress ?? "",
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
  const hasPinInput = typeof req.body.pin === "string" && req.body.pin !== "";
  const hasPasswordInput = typeof req.body.password === "string" && req.body.password !== "";
  if (!hasPinInput && !hasPasswordInput) throw new AppError("Choose a 4-digit PIN for your account", 400);
  const newPin = hasPinInput ? loginPin(req.body.pin) : null;
  const newPassword = hasPasswordInput ? password(req.body.password) : null;
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
    throw new AppError("This phone number or NIN is already registered. Log in instead.", 409);
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      phone,
      email,
      nationalId: normalizedNin || null,
      pinHash: newPin ? await bcrypt.hash(newPin, 12) : null,
      passwordHash: newPassword ? await bcrypt.hash(newPassword, 12) : null,
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
  // `pin` carries the 4-digit PIN; older clients send the backup password in the same field.
  const supplied = typeof req.body.pin === "string" && req.body.pin
    ? req.body.pin
    : typeof req.body.password === "string" ? req.body.password : "";
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || (!user.pinHash && !user.passwordHash) || user.deletedAt) throw new AppError("Wrong phone number or PIN", 401);
  if (!user.phoneVerified) throw new AppError("Verify your phone before signing in", 403);
  await assertLoginSecret(user, supplied);

  await writeAuditEvent({ actorId: user.id, subjectUserId: user.id, action: "auth.login", resourceType: "auth_session" });
  res.json(await sessionResponse(user, req));
});

/**
 * Staff sign-in is phone-first: every staff account is invited and verified
 * against its Uganda phone number. An email address is still accepted for
 * legacy staff accounts created before phone-based sign-in.
 */
async function findStaffByIdentifier(req: Request): Promise<User | null> {
  const identifier = String(req.body.identifier ?? req.body.phone ?? req.body.email ?? "").trim();
  if (!identifier) throw new AppError("Phone number and password are required", 400);
  if (identifier.includes("@")) {
    return prisma.user.findUnique({ where: { email: normalizedEmail(identifier)! } });
  }
  return prisma.user.findUnique({ where: { phone: normalizedPhone(identifier) } });
}

router.post("/admin-login", async (req: Request, res: Response) => {
  const supplied = typeof req.body.password === "string" ? req.body.password : "";
  if (!supplied) throw new AppError("Phone number and password are required", 400);

  const user = await findStaffByIdentifier(req);
  if (!user || !isStaffRole(user.role) || user.deletedAt) throw new AppError("Invalid credentials", 401);
  if (!user.passwordHash) {
    // Invited but never activated: resend the invite code instead of leaking
    // the account state with a different error.
    if (user.phone && !user.phoneVerified) {
      await issueOtp(user, "staff_invite");
      throw new AppError("This staff account is not activated yet. We sent a new activation code to its phone — open “First time? Activate account”.", 409);
    }
    throw new AppError("Invalid credentials", 401);
  }
  if (!await bcrypt.compare(supplied, user.passwordHash)) throw new AppError("Invalid credentials", 401);

  if (process.env.NODE_ENV === "test") {
    res.json(await sessionResponse(user, req));
    return;
  }
  if (!user.phone || !user.phoneVerified) throw new AppError("Staff sign-in requires a verified phone number. Ask the Super Admin to re-invite this account.", 403);

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
  if (!user || user.deletedAt || !isStaffRole(user.role) || user.authVersion !== challenge.authVersion) {
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
  if (!user || user.deletedAt || !isStaffRole(user.role) || user.authVersion !== challenge.authVersion) {
    throw new AppError("Admin verification challenge is no longer valid", 401);
  }
  await issueOtp(user, "admin_login");
  res.json({ ok: true });
});

// ── Staff invitation acceptance ─────────────────────────────────────────────
// The Super Admin invites staff by phone number (see /api/staff/invite). The
// invitee activates the account here with the SMS code and a password of their
// choice; afterwards the normal staff sign-in (phone + password + SMS code)
// applies. Responses stay generic so the endpoint cannot enumerate which
// phone numbers hold pending staff invitations.

const GENERIC_INVITE_RESPONSE = {
  ok: true,
  message: "If that number has a pending staff invitation, a new activation code has been sent.",
};

router.post("/staff-invite/activate", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.deletedAt || !isStaffRole(user.role) || user.passwordHash || user.phoneVerified) {
    throw new AppError("Invalid or expired activation code", 401);
  }

  const newPassword = password(req.body.password);
  await assertOtp(user, "staff_invite", req.body.code);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      phoneVerified: true,
      authVersion: { increment: 1 },
      ...clearOtp,
    },
  });
  await writeAuditEvent({ actorId: user.id, subjectUserId: user.id, action: "auth.staff_invite_activated", resourceType: "user", resourceId: user.id });
  res.json(await sessionResponse(updated, req));
});

router.post("/staff-invite/resend", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (user && !user.deletedAt && isStaffRole(user.role) && !user.passwordHash && !user.phoneVerified) {
    await issueOtp(user, "staff_invite");
  }
  res.json(GENERIC_INVITE_RESPONSE);
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

  // Customers reset their PIN; staff (and customers who prefer it) reset a password.
  const resetsPin = typeof req.body.newPin === "string" && req.body.newPin !== "";
  const secret = resetsPin
    ? { pinHash: await bcrypt.hash(loginPin(req.body.newPin), 12) }
    : { passwordHash: await bcrypt.hash(password(req.body.newPassword), 12) };
  await assertOtp(user, "password_reset", req.body.code);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { ...secret, loginAttempts: 0, loginLockedUntil: null, authVersion: { increment: 1 }, ...clearOtp },
    }),
    prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAuditEvent({ subjectUserId: user.id, action: "auth.password_reset", resourceType: "user", resourceId: user.id });
  res.json({ ok: true, message: resetsPin ? "PIN updated. Log in with your new PIN." : "Password updated. Sign in with your new password." });
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

router.patch("/me", authenticateToken, async (req: Request, res: Response) => {
  const current = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!current || current.deletedAt) throw new AppError("User not found", 404);

  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : current.fullName;
  if (fullName.length < 2 || fullName.length > 120) throw new AppError("Enter your full name", 400);
  if (current.kycVerified && fullName !== current.fullName) {
    throw new AppError("A verified legal name can only be changed through identity re-verification", 409);
  }

  const email = normalizedEmail(req.body.email);
  if (email) {
    const owner = await prisma.user.findFirst({ where: { email, id: { not: current.id }, deletedAt: null } });
    if (owner) throw new AppError("That email address is already registered", 409);
  }

  let dateOfBirth: Date | null = current.dateOfBirth;
  if (req.body.dateOfBirth === "" || req.body.dateOfBirth === null) dateOfBirth = null;
  else if (typeof req.body.dateOfBirth === "string") {
    dateOfBirth = new Date(`${req.body.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) throw new AppError("Enter a valid date of birth", 400);
  }

  const text = (value: unknown, fallback: string | null, max: number) => {
    if (typeof value !== "string") return fallback;
    const result = value.trim();
    if (result.length > max) throw new AppError(`Profile field must be ${max} characters or fewer`, 400);
    return result;
  };

  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      fullName,
      // Customers have no email; leave a stored one untouched unless it was sent.
      ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, "email") ? { email } : {}),
      dateOfBirth,
      district: text(req.body.district, current.district, 100),
      occupation: text(req.body.occupation, current.occupation, 120),
      physicalAddress: text(req.body.physicalAddress, current.physicalAddress, 250),
    },
  });
  await writeAuditEvent({ actorId: current.id, subjectUserId: current.id, action: "profile.updated", resourceType: "user", resourceId: current.id });
  res.json({ user: (await buildSession(user)).user });
});

/**
 * Set or change the login PIN or the backup password while signed in. The
 * current PIN or password is required again, so a borrowed unlocked phone
 * cannot quietly replace the owner's credentials.
 */
router.post("/credentials", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  const current = typeof req.body.current === "string" ? req.body.current : "";
  if (!current) throw new AppError("Enter your current PIN or password", 400);

  const setsPin = typeof req.body.newPin === "string" && req.body.newPin !== "";
  const setsPassword = typeof req.body.newPassword === "string" && req.body.newPassword !== "";
  if (!setsPin && !setsPassword) throw new AppError("Enter a new PIN or password", 400);
  const data = {
    ...(setsPin ? { pinHash: await bcrypt.hash(loginPin(req.body.newPin), 12) } : {}),
    ...(setsPassword ? { passwordHash: await bcrypt.hash(password(req.body.newPassword), 12) } : {}),
  };

  await assertLoginSecret(user, current);
  await prisma.user.update({ where: { id: user.id }, data });
  await writeAuditEvent({
    actorId: user.id,
    subjectUserId: user.id,
    action: setsPin ? "auth.pin_changed" : "auth.password_changed",
    resourceType: "user",
    resourceId: user.id,
  });
  res.json({ ok: true, hasPin: setsPin || !!user.pinHash, hasPassword: setsPassword || !!user.passwordHash });
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
