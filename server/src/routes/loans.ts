import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { localQuote } from "../lib/pricing.js";

const router = Router();

// GET /api/loans/applications
router.get("/applications", authenticateToken, async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === "admin";
  const where = isAdmin ? {} : { applicantId: req.user!.userId };

  const applications = await prisma.loanApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.json({
    applications: applications.map((a) => ({
      id: a.id,
      applicantId: a.applicantId,
      applicantName: a.applicantName,
      amount: Number(a.amount),
      purpose: a.purpose,
      termDays: a.termDays,
      channel: a.channel,
      status: a.status,
      total: Number(a.total),
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
      decisionNotes: a.decisionNotes,
    })),
  });
});

// POST /api/loans/applications
router.post("/applications", authenticateToken, async (req: Request, res: Response) => {
  const { amount, purpose, termDays, channel } = req.body;
  const userId = req.user!.userId;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { savingsAccount: true } });
  if (!user) throw new AppError("User not found", 404);

  const quote = localQuote(Number(amount), Number(termDays), Number(user.savingsAccount?.balance ?? 0));

  const application = await prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: user.fullName,
      amount: BigInt(Math.round(Number(amount))),
      purpose: purpose || "Personal",
      termDays: quote.termDays,
      channel: channel || "MTN MoMo",
      apr: quote.apr,
      interest: BigInt(Math.round(quote.interest)),
      total: BigInt(Math.round(quote.total)),
      status: "pending",
    },
  });

  res.json({
    application: {
      id: application.id,
      applicantId: application.applicantId,
      applicantName: application.applicantName,
      amount: Number(application.amount),
      purpose: application.purpose,
      termDays: application.termDays,
      channel: application.channel,
      status: application.status,
      total: Number(application.total),
      createdAt: application.createdAt,
      decidedAt: null,
      decisionNotes: null,
    },
  });
});

// POST /api/loans/applications/decision
router.post("/applications/decision", authenticateToken, async (req: Request, res: Response) => {
  if (req.user!.role !== "admin") throw new AppError("Admin access required", 403);

  const { id, decision, notes } = req.body;
  const status = decision === "approved" ? "offered" : "rejected";

  const application = await prisma.loanApplication.update({
    where: { id, status: "pending" },
    data: { status, decisionNotes: notes || null, decidedAt: new Date() },
  });

  if (!application) throw new AppError("Application not found or already decided", 404);

  res.json({
    application: {
      id: application.id,
      applicantId: application.applicantId,
      applicantName: application.applicantName,
      amount: Number(application.amount),
      purpose: application.purpose,
      termDays: application.termDays,
      channel: application.channel,
      status: application.status,
      total: Number(application.total),
      createdAt: application.createdAt,
      decidedAt: application.decidedAt,
      decisionNotes: application.decisionNotes,
    },
  });
});

// POST /api/loans/quote
router.post("/quote", authenticateToken, async (req: Request, res: Response) => {
  const { amount, termDays } = req.body;
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true },
  });

  const quote = localQuote(Number(amount), Number(termDays), Number(user?.savingsAccount?.balance ?? 0));
  res.json(quote);
});

// GET /api/loans/repayment
router.get("/repayment", authenticateToken, async (req: Request, res: Response) => {
  const repayment = await prisma.repayment.findFirst({
    where: { userId: req.user!.userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  if (!repayment) {
    res.json({ repayment: null });
    return;
  }

  const daysToDue = Math.ceil((new Date(repayment.dueDate).getTime() - Date.now()) / 86400000);
  res.json({
    repayment: {
      ...repayment,
      total: Number(repayment.total),
      amountPaid: Number(repayment.amountPaid),
      collection: {
        stage: repayment.status === "paid" ? "paid" : "scheduled",
        label: repayment.status === "paid" ? "Repaid" : `Due in ${daysToDue} days`,
        daysToDue,
      },
    },
  });
});

// POST /api/loans/repayment/pay
router.post("/repayment/pay", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { amount } = req.body;

  const repayment = await prisma.repayment.findFirst({
    where: { userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  if (!repayment) {
    res.json({
      repayment: null,
      attempt: { success: false, reason: "no-active-loan" },
      isPartial: false,
    });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const balance = Number(wallet?.balance ?? 0);
  const outstanding = Number(repayment.total) - Number(repayment.amountPaid);
  const payAmount = amount ? Math.min(Math.round(Number(amount)), outstanding) : outstanding;

  if (balance < payAmount || payAmount <= 0) {
    res.json({
      repayment: { ...repayment, total: Number(repayment.total), amountPaid: Number(repayment.amountPaid) },
      attempt: { success: false, reason: "insufficient-wallet-balance" },
      isPartial: false,
    });
    return;
  }

  const newPaid = Number(repayment.amountPaid) + payAmount;
  const receiptId = "RCPT-" + Date.now();
  const isPartial = payAmount < outstanding;

  await prisma.wallet.update({ where: { userId }, data: { balance: { decrement: payAmount } } });

  if (newPaid >= Number(repayment.total)) {
    await prisma.repayment.update({
      where: { id: repayment.id },
      data: { status: "paid", amountPaid: repayment.total, receiptId },
    });
    await prisma.loanApplication.updateMany({
      where: { applicantId: userId, loanId: repayment.loanId },
      data: { status: "paid" },
    });
  } else {
    await prisma.repayment.update({
      where: { id: repayment.id },
      data: { amountPaid: newPaid, receiptId },
    });
  }

  await prisma.transaction.create({
    data: { userId, loanId: repayment.loanId, type: "loan_payment", amount: BigInt(payAmount), status: "completed" },
  });

  res.json({
    repayment: { ...repayment, total: Number(repayment.total), amountPaid: newPaid, receiptId },
    attempt: { success: true, reason: isPartial ? "partial-payment-collected" : "collected" },
    isPartial,
  });
});

export default router;
