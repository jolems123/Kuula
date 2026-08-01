import { Router, Request, Response } from "express";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { generateToken, authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { computeCreditScore } from "../lib/credit-score.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";
import { recognizedSavingsBalance } from "../lib/savings-policy.js";
import { normalizeUgandaMobileMoneyPhone } from "../lib/marzpay.js";
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

function tokenFor(user: Pick<User, "id" | "role" | "authVersion">): string {
  const role = user.role === "admin" ? "admin" as const : "user" as const;
  return generateToken({ userId: user.id, role, authVersion: user.authVersion });
}

function cooldownSeconds(lastSentAt: Date | null, now = new Date()): number {
  if (!lastSentAt) return 0;
  const elapsed = now.getTime() - lastSentAt.getTime();
  return Math.max(0, Math.ceil((OTP_POLICY.resendCooldownSeconds * 1000 - elapsed) / 1000));
}

async function issueOtp(user: User, purpose: OtpPurpose): Promise<void> {
  if (!smsConfigured()) {
    throw new AppError("SMS verification is temporarily unavailable", 503);
  }

  const now = new Date();
  if (user.otpLockedUntil && user.otpLockedUntil > now) {
    const seconds = Math.ceil((user.otpLockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(`Verification is locked. Try again in ${seconds} seconds.`, 429);
  }

  const retryAfter = cooldownSeconds(user.otpLastSentAt, now);
  if (retryAfter > 0) {
    throw new AppError(`Wait ${retryAfter} seconds before requesting another code.`, 429);
  }
  if (!user.phone) throw new AppError("No verified phone number is available", 422);

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
      data: { otpHash: null, otpPurpose: null, otpExpiresAt: null },
    });
    throw new AppError(
      error instanceof Error ? `Could not send verification SMS: ${error.message}` : "Could not send verification SMS",
      503
    );
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
  const isAdmin = user.role === "admin";
  const savingsBalance = recognizedSavingsBalance(user.savingsAccount?.balance);
  const credit = isAdmin ? null : computeCreditScore({
    momoMonths: user.momoMonths ?? 0,
    momoTxnCount: user.momoTxnCount ?? 0,
    crbStatus: user.crbStatus ?? "thin",
    savingsBalance,
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  });

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    orderBy: { createdAt: "asc" },
  });

  const activeApp = isAdmin ? null : await prisma.loanApplication.findFirst({
    where: { applicantId: user.id, status: { in: ["active", "overdue"] } },
    orderBy: { decidedAt: "desc" },
  });
  const nextRep = isAdmin ? null : await prisma.repayment.findFirst({
    where: { userId: user.id, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  const scoreValue = credit?.score ?? 0;
  const tierLimit = scoreValue >= 750 ? 2_000_000 : scoreValue >= 700 ? 1_000_000 : scoreValue >= 600 ? 500_000 : scoreValue >= 500 ? 200_000 : 0;

  return {
    role: user.role,
    user: {
      id: user.id,
      role: user.role,
      initials: (user.fullName || "KU").split(" ").map((word: string) => word[0]).join("").slice(0, 2).toUpperCase() || "KU",
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
    },
    credit,
    loan: isAdmin ? null : {
      availableCredit: activeApp ? 0 : tierLimit,
      creditIncreaseFromLastMonth: 0,
      totalLoansCount: user.loansTotal ?? 0,
      activeLoan: activeApp ? {
        id: activeApp.loanId || activeApp.id,
        amount: Number(activeApp.amount),
        repaidPercent: nextRep ? Math.round((Number(nextRep.amountPaid) / Math.max(Number(nextRep.total), 1)) * 100) : 0,
        status: activeApp.status,
        disbursedDate: new Date(activeApp.decidedAt || activeApp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      } : null,
      nextPayment: nextRep ? {
        amount: Number(nextRep.total) - Number(nextRep.amountPaid),
        dueDate: new Date(nextRep.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        daysLeft: Math.max(0, Math.ceil((new Date(nextRep.dueDate).getTime() - Date.now()) / 86_400_000)),
      } : null,
    },
    savingsBalance: isAdmin ? 0 : savingsBalance,
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      createdAt: message.createdAt,
      isRead: message.isRead,
    })),
    unreadNotifications: await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    }),
  };
}

router.post("/signup", async (req: Request, res: Response) => {
  const { name, nationalId, acceptedTerms, termsVersion } = req.body;
  const phone = normalizedPhone(req.body.phone);
  const email = normalizedEmail(req.body.email);
  const newPassword = password(req.body.password);

  if (!String(name || "").trim()) throw new AppError("Name is required", 400);
  if (!acceptedTerms) throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);
  const normalizedNin = nationalId ? normalizeNin(String(nationalId)) : "";
  if (normalizedNin && !isValidUgandaNin(normalizedNin)) {
    throw new AppError("A valid 14-character Uganda NIN is required", 400);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
  });
  if (existing) throw new AppError("Phone or email already registered", 409);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.create({
    data: {
      fullName: String(name).trim(),
      phone,
      email,
      nationalId: normalizedNin || null,
      passwordHash,
      role: "user",
      phoneVerified: false,
      termsAcceptedAt: new Date(),
      termsVersion: typeof termsVersion === "string" ? termsVersion : null,
      savingsAccount: { create: { balance: 0 } },
      wallet: { create: { balance: 0 } },
    },
  });

  await issueOtp(user, "phone_verify");
  res.status(201).json({ ok: true, needsConfirmation: true });
});

router.post("/login", async (req: Request, res: Response) => {
  const phone = normalizedPhone(req.body.phone);
  const pin = typeof req.body.pin === "string" ? req.body.pin : "";
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { savingsAccount: true, wallet: true },
  });
  if (!user || !user.passwordHash || user.deletedAt) throw new AppError("Invalid phone number or PIN", 401);
  if (!user.phoneVerified) throw new AppError("Verify your phone before signing in", 403);
  if (!await bcrypt.compare(pin, user.passwordHash)) throw new AppError("Invalid phone number or PIN", 401);

  res.json({ token: tokenFor(user), refreshToken: "", ...await buildSession(user) });
});

router.post("/admin-login", async (req: Request, res: Response) => {
  const email = normalizedEmail(req.body.email);
  const supplied = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !supplied) throw new AppError("Email and password are required", 400);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { savingsAccount: true, wallet: true },
  });
  if (!user || !user.passwordHash || user.role !== "admin" || user.deletedAt) {
    throw new AppError("Invalid credentials", 401);
  }
  if (!await bcrypt.compare(supplied, user.passwordHash)) throw new AppError("Invalid credentials", 401);

  res.json({ token: tokenFor(user), refreshToken: "", ...await buildSession(user) });
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
    include: { savingsAccount: true, wallet: true },
  });
  res.json({ token: tokenFor(updated), refreshToken: "", ...await buildSession(updated) });
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

  if (user && !user.deletedAt && user.phoneVerified && user.phone) {
    await issueOtp(user, "password_reset");
  }
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
  const newPassword = password(req.body.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      authVersion: { increment: 1 },
      ...clearOtp,
    },
  });
  res.json({ ok: true, message: "Password updated. Sign in with your new password." });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true, wallet: true },
  });
  if (!user || user.deletedAt) throw new AppError("User not found", 404);
  res.json({ token: req.headers.authorization?.slice(7) || "", refreshToken: "", ...await buildSession(user) });
});

router.post("/signout", authenticateToken, async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { authVersion: { increment: 1 } },
  });
  res.json({ ok: true });
});

export default router;
