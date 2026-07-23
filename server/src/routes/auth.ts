import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { generateToken, authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { computeCreditScore } from "../lib/credit-score.js";

const router = Router();

async function buildSession(user: any) {
  const isAdmin = user.role === "admin";
  const savingsBalance = Number(user.savingsAccount?.balance ?? 0);
  console.log("[auth.buildSession] start", { userId: user.id, role: user.role });

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

  // Fetch messages separately (not available as relation called "messages")
  let messages: any[] = [];
  try {
    messages = await prisma.message.findMany({
      where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    console.error("[auth.buildSession] message.findMany failed", err);
    throw err;
  }

  let activeApp = null;
  let nextRep = null;
  if (!isAdmin) {
    try {
      activeApp = await prisma.loanApplication.findFirst({
        where: { applicantId: user.id, status: { in: ["approved", "active"] } },
        orderBy: { decidedAt: "desc" },
      });
    } catch (err) {
      console.error("[auth.buildSession] loanApplication.findFirst failed", err);
      throw err;
    }

    try {
      nextRep = await prisma.repayment.findFirst({
        where: { userId: user.id, status: { not: "paid" } },
        orderBy: { dueDate: "asc" },
      });
    } catch (err) {
      console.error("[auth.buildSession] repayment.findFirst failed", err);
      throw err;
    }
  }

  const scoreValue = credit?.score ?? 0;
  const tierLimit = scoreValue >= 750 ? 2000000 : scoreValue >= 700 ? 1000000 : scoreValue >= 600 ? 500000 : scoreValue >= 500 ? 200000 : 0;

  const userProfile = {
    id: user.id,
    role: user.role,
    initials: (user.fullName || "KU").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "KU",
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
    loan: isAdmin ? null : {
      availableCredit: activeApp ? 0 : tierLimit,
      creditIncreaseFromLastMonth: 0,
      totalLoansCount: user.loansTotal ?? 0,
      activeLoan: activeApp ? {
        id: activeApp.loanId || activeApp.id,
        amount: Number(activeApp.amount),
        repaidPercent: nextRep ? Math.round(((Number(nextRep.amountPaid) ?? 0) / (Number(nextRep.total) || 1)) * 100) : 0,
        status: activeApp.status,
        disbursedDate: activeApp.decidedAt
          ? new Date(activeApp.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : new Date(activeApp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      } : null,
      nextPayment: nextRep ? {
        amount: Number(nextRep.total) - Number(nextRep.amountPaid),
        dueDate: new Date(nextRep.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        daysLeft: Math.max(0, Math.ceil((new Date(nextRep.dueDate).getTime() - Date.now()) / 86400000)),
      } : null,
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
    unreadNotifications: await (async () => {
      try {
        return await prisma.notification.count({
          where: { userId: user.id, isRead: false },
        });
      } catch (err) {
        console.error("[auth.buildSession] notification.count failed", err);
        throw err;
      }
    })(),
  };
}

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { name, phone, email, password, nationalId, acceptedTerms, termsVersion } = req.body;
    if (!name?.trim() || !phone?.trim() || !password) throw new AppError("Name, phone, and password are required", 400);
    if (!acceptedTerms) throw new AppError("You must accept the Terms of Service and Privacy Policy", 400);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    });
    if (existing) throw new AppError("Phone or email already registered", 409);

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        fullName: name, phone, email: email || null, nationalId: nationalId || null, passwordHash,
        role: "user", phoneVerified: false,
        // Timestamp is set server-side so consent can't be back-dated by the client.
        termsAcceptedAt: new Date(),
        termsVersion: typeof termsVersion === "string" ? termsVersion : null,
        savingsAccount: { create: { balance: 0 } },
        wallet: { create: { balance: 0 } },
      },
    });

    res.json({ ok: true, needsConfirmation: true });
  } catch (err) {
    console.error("signup route failure:", err);
    throw err;
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) throw new AppError("Phone and PIN are required", 400);

    const user = await prisma.user.findUnique({
      where: { phone },
      include: { savingsAccount: true, wallet: true },
    });
    if (!user || !user.passwordHash) throw new AppError("Invalid phone number or PIN", 401);

    const valid = await bcrypt.compare(pin, user.passwordHash);
    if (!valid) throw new AppError("Invalid phone number or PIN", 401);

    const role = user.role === "admin" ? "admin" as const : "user" as const;
    const token = generateToken({ userId: user.id, role });
    const session = await buildSession(user);
    res.json({ token, refreshToken: "", ...session });
  } catch (err) {
    console.error("login route failure:", err);
    throw err;
  }
});

router.post("/admin-login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError("Email and password are required", 400);

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { savingsAccount: true, wallet: true },
  });
  if (!user || !user.passwordHash || user.role !== "admin") throw new AppError("Invalid credentials", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError("Invalid credentials", 401);

  const token = generateToken({ userId: user.id, role: "admin" });
  const session = await buildSession(user);
  res.json({ token, refreshToken: "", ...session });
});

router.post("/verify-phone", async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!/^\d{6}$/.test(code)) throw new AppError("Enter the 6-digit code", 400);

  const user = await prisma.user.findFirst({ where: { phone, otpCode: code, otpExpiresAt: { gte: new Date() } } });
  if (!user) throw new AppError("Invalid or expired code", 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerified: true, otpCode: null, otpExpiresAt: null },
  });

  const role = user.role === "admin" ? "admin" as const : "user" as const;
  const token = generateToken({ userId: user.id, role });
  const updated = await prisma.user.findUnique({
    where: { id: user.id },
    include: { savingsAccount: true, wallet: true },
  });
  const session = await buildSession(updated!);
  res.json({ token, refreshToken: "", ...session });
});

router.post("/resend-otp", async (req: Request, res: Response) => {
  const { phone } = req.body;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AppError("Phone not found", 404);

  const otpCode = crypto.randomInt(100000, 999999).toString();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({ where: { id: user.id }, data: { otpCode, otpExpiresAt } });
  console.log(`[DEV] OTP for ${phone}: ${otpCode}`);
  res.json({ ok: true });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email?.trim().toLowerCase() } });
  if (user) {
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.user.update({ where: { id: user.id }, data: { otpCode, otpExpiresAt } });
    console.log(`[DEV] Password reset OTP for ${email}: ${otpCode}`);
  }
  res.json({ ok: true });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true, wallet: true },
  });
  if (!user) throw new AppError("User not found", 404);
  const session = await buildSession(user);
  res.json({ token: req.headers["authorization"]?.slice(7) || "", refreshToken: "", ...session });
});

router.post("/signout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;

