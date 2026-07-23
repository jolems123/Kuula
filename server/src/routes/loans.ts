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
const mapApplication = (application: any) => ({
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
  decidedAt: application.decidedAt ?? null,
  decisionNotes: application.decisionNotes ?? null,
});

async function createLoanApplicationForUser(
  userId: string,
  payload: { amount: number; purpose?: string; termDays: number; channel?: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { savingsAccount: true } });
  if (!user) throw new AppError("User not found", 404);

  const quote = localQuote(Number(payload.amount), Number(payload.termDays), Number(user.savingsAccount?.balance ?? 0));

  const application = await prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: user.fullName,
      amount: BigInt(Math.round(Number(payload.amount))),
      purpose: payload.purpose || "Personal",
      termDays: quote.termDays,
      channel: payload.channel || "MTN MoMo",
      apr: quote.apr,
      interest: BigInt(Math.round(quote.interest)),
      total: BigInt(Math.round(quote.total)),
      status: "pending",
    },
  });

  return application;
}

router.post("/applications", authenticateToken, async (req: Request, res: Response) => {
  const { amount, purpose, termDays, channel } = req.body as {
    amount: number;
    purpose?: string;
    termDays: number;
    channel?: string;
  };
  const userId = req.user!.userId;

  const application = await createLoanApplicationForUser(userId, {
    amount: Number(amount),
    purpose,
    termDays: Number(termDays),
    channel,
  });

  res.json({ application: mapApplication(application) });
});

// POST /api/loans/top-up
router.post("/top-up", authenticateToken, async (req: Request, res: Response) => {
  const { amount, term_days, purpose, disbursement_method } = req.body as {
    amount: number;
    term_days: number;
    purpose?: string;
    disbursement_method?: string;
  };
  const userId = req.user!.userId;

  const application = await createLoanApplicationForUser(userId, {
    amount: Number(amount),
    purpose: purpose || "Top-up",
    termDays: Number(term_days),
    channel: disbursement_method || "MTN MoMo",
  });

  res.json({
    success: true,
    loan_id: application.id,
    status: application.status,
    pricing: {
      apr: application.apr,
      interest: Number(application.interest),
      total: Number(application.total),
      term_days: application.termDays,
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

  res.json({ application: mapApplication(application) });
});

// POST /api/loans/:id/accept
router.post("/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const userId = req.user!.userId;

  const existing = await prisma.loanApplication.findUnique({ where: { id } });
  if (!existing || existing.applicantId !== userId) {
    throw new AppError("Loan offer not found", 404);
  }
  if (existing.status !== "offered") {
    throw new AppError("Only offered loans can be accepted", 400);
  }

  const principal = Math.max(0, Number(existing.amount));
  const total = Math.max(Number(existing.total), principal);
  const loanId = existing.loanId ?? existing.id;

  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.loanApplication.update({
      where: { id: existing.id },
      data: {
        status: "active",
        loanId,
      },
    });

    const repayment = await tx.repayment.findFirst({
      where: { userId, loanId, status: { not: "paid" } },
      orderBy: { createdAt: "desc" },
    });

    const effectiveRepayment = repayment ?? await tx.repayment.create({
      data: {
        userId,
        loanId,
        total: BigInt(Math.round(total)),
        amountPaid: BigInt(0),
        dueDate: new Date(Date.now() + application.termDays * 24 * 60 * 60 * 1000),
        status: "scheduled",
        attempts: [],
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        loanId,
        type: "loan_disbursement",
        amount: BigInt(Math.round(principal)),
        status: "completed",
      },
    });

    await tx.wallet.upsert({
      where: { userId },
      update: { balance: { increment: Math.round(principal) } },
      create: { userId, balance: BigInt(Math.round(principal)) },
    });

    await tx.notification.create({
      data: {
        userId,
        title: "Loan Disbursed",
        body: `Your loan of UGX ${Math.round(principal).toLocaleString()} has been disbursed to your wallet.`,
        type: "success",
      },
    });

    return { application, repayment: effectiveRepayment };
  });

  res.json({
    application: mapApplication(result.application),
    repayment: {
      ...result.repayment,
      total: Number(result.repayment.total),
      amountPaid: Number(result.repayment.amountPaid),
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
