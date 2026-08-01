import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { localQuote, type LoanQuote } from "../lib/pricing.js";
import {
  buildMarzPayWebhookUrl,
  collectMoney,
  createPaymentReference,
  marzPayConfigured,
  normalizeMarzPayAmount,
  normalizeUgandaMobileMoneyPhone,
  sendMoney,
} from "../lib/marzpay.js";

const router = Router();

function quoteForRequest(amount: unknown, termDays: unknown, savingsBalance = 0): LoanQuote {
  try {
    return localQuote(Number(amount), Number(termDays), savingsBalance);
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(error.message, 400);
    throw error;
  }
}

function providerCallbackUrl(): string {
  if (!marzPayConfigured()) {
    throw new AppError("Mobile-money payments are not configured", 503);
  }
  try {
    return buildMarzPayWebhookUrl();
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Payment callback is not configured", 503);
  }
}

function providerPhone(phone: string | null): string {
  try {
    return normalizeUgandaMobileMoneyPhone(phone || "");
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid mobile-money phone", 422);
  }
}

function providerAmount(amount: number): number {
  try {
    return normalizeMarzPayAmount(amount);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid mobile-money amount", 400);
  }
}

function jsonAttempts(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value as Prisma.JsonArray : [];
}

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

// GET /api/loans/applications
router.get("/applications", authenticateToken, async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === "admin";
  const where = isAdmin ? {} : { applicantId: req.user!.userId };
  const applications = await prisma.loanApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  res.json({ applications: applications.map(mapApplication) });
});

async function createLoanApplicationForUser(
  userId: string,
  payload: { amount: number; purpose?: string; termDays: number; channel?: string }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { savingsAccount: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const quote = quoteForRequest(
    payload.amount,
    payload.termDays,
    Number(user.savingsAccount?.balance ?? 0)
  );

  return prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: user.fullName,
      amount: BigInt(quote.principal),
      purpose: payload.purpose || "Personal",
      termDays: quote.termDays,
      channel: payload.channel || "MTN MoMo",
      apr: quote.apr,
      interest: BigInt(quote.interest),
      total: BigInt(quote.total),
      status: "pending",
    },
  });
}

router.post("/applications", authenticateToken, async (req: Request, res: Response) => {
  const { amount, purpose, termDays, channel } = req.body as {
    amount: number;
    purpose?: string;
    termDays: number;
    channel?: string;
  };
  const application = await createLoanApplicationForUser(req.user!.userId, {
    amount: Number(amount),
    purpose,
    termDays: Number(termDays),
    channel,
  });
  res.json({ application: mapApplication(application) });
});

router.post("/top-up", authenticateToken, async (req: Request, res: Response) => {
  const { amount, term_days, purpose, disbursement_method } = req.body as {
    amount: number;
    term_days: number;
    purpose?: string;
    disbursement_method?: string;
  };
  const application = await createLoanApplicationForUser(req.user!.userId, {
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
      principal: Number(application.amount),
      apr: Number(application.apr),
      interest: Number(application.interest),
      total: Number(application.total),
      term_days: application.termDays,
      compound: false,
    },
  });
});

router.post("/applications/decision", authenticateToken, async (req: Request, res: Response) => {
  if (req.user!.role !== "admin") throw new AppError("Admin access required", 403);

  const { id, decision, notes } = req.body;
  if (decision !== "approved" && decision !== "rejected") {
    throw new AppError("Decision must be approved or rejected", 400);
  }

  const application = await prisma.loanApplication.update({
    where: { id, status: "pending" },
    data: {
      status: decision === "approved" ? "offered" : "rejected",
      decisionNotes: notes || null,
      decidedAt: new Date(),
    },
  });
  res.json({ application: mapApplication(application) });
});

// Borrower acceptance initiates a real mobile-money disbursement. No loan,
// repayment, or completed ledger entry is booked until the verified webhook.
router.post("/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const applicationId = String(req.params.id);
  const userId = req.user!.userId;
  const existing = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { applicant: true },
  });

  if (!existing || existing.applicantId !== userId) {
    throw new AppError("Loan offer not found", 404);
  }
  if (existing.status !== "offered") {
    throw new AppError("Only offered loans can be accepted", 409);
  }
  if (!existing.applicant.phoneVerified) {
    throw new AppError("Verify your phone before receiving a loan", 403);
  }
  if (!existing.applicant.kycVerified) {
    throw new AppError("Complete identity verification before receiving a loan", 403);
  }

  const phone = providerPhone(existing.applicant.phone);
  const amount = providerAmount(Number(existing.amount));
  const callbackUrl = providerCallbackUrl();
  const reference = createPaymentReference();
  const loanId = existing.loanId || existing.id;

  const claimedApplication = await prisma.$transaction(async (tx) => {
    const claim = await tx.loanApplication.updateMany({
      where: {
        id: existing.id,
        applicantId: userId,
        status: "offered",
        acceptedAt: null,
      },
      data: {
        status: "disbursing",
        acceptedAt: new Date(),
        loanId,
      },
    });
    if (claim.count !== 1) {
      throw new AppError("This loan offer is already being processed", 409);
    }

    await tx.transaction.create({
      data: {
        userId,
        loanId,
        type: "loan_disbursement",
        amount: BigInt(amount),
        status: "pending",
        reference,
        provider: "marzpay",
        providerStatus: "initiating",
      },
    });

    return tx.loanApplication.findUniqueOrThrow({ where: { id: existing.id } });
  });

  const result = await sendMoney({
    phone,
    amount,
    reference,
    description: `Kuula loan ${loanId}`,
    callbackUrl,
  });

  if (!result.accepted) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { reference },
        data: {
          status: "failed",
          providerStatus: result.status,
          transactionId: result.uuid || null,
          providerPayload: result.raw as Prisma.InputJsonValue,
        },
      }),
      prisma.loanApplication.update({
        where: { id: existing.id },
        data: {
          status: "offered",
          acceptedAt: null,
          disbursementRef: result.uuid || reference,
        },
      }),
    ]);
    throw new AppError(`Mobile-money disbursement was not accepted: ${result.message}`, 502);
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { reference },
      data: {
        providerStatus: result.status || "processing",
        transactionId: result.uuid || null,
        providerPayload: result.raw as Prisma.InputJsonValue,
      },
    }),
    prisma.loanApplication.update({
      where: { id: existing.id },
      data: { disbursementRef: result.uuid || reference },
    }),
  ]);

  res.json({
    application: mapApplication(claimedApplication),
    disbursement: {
      status: "pending",
      uuid: result.uuid,
      reference,
      message: "Your mobile-money disbursement is being processed.",
    },
  });
});

router.post("/quote", authenticateToken, async (req: Request, res: Response) => {
  const { amount, termDays } = req.body;
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true },
  });
  if (!user) throw new AppError("User not found", 404);

  res.json(quoteForRequest(
    amount,
    termDays,
    Number(user.savingsAccount?.balance ?? 0)
  ));
});

router.get("/repayment", authenticateToken, async (req: Request, res: Response) => {
  const repayment = await prisma.repayment.findFirst({
    where: { userId: req.user!.userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  if (!repayment) {
    res.json({ repayment: null });
    return;
  }

  const daysToDue = Math.ceil((repayment.dueDate.getTime() - Date.now()) / 86_400_000);
  res.json({
    repayment: {
      ...repayment,
      total: Number(repayment.total),
      amountPaid: Number(repayment.amountPaid),
      amount_paid: Number(repayment.amountPaid),
      due_date: repayment.dueDate,
      collection: {
        stage: repayment.pendingCollectionRef ? "processing" : "scheduled",
        label: repayment.pendingCollectionRef
          ? "Mobile-money payment pending"
          : `Due in ${daysToDue} days`,
        daysToDue,
      },
    },
  });
});

// A repayment request only creates a pending provider collection. The balance
// changes later, and only in the verified MarZPay webhook transaction.
router.post("/repayment/pay", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const repayment = await prisma.repayment.findFirst({
    where: { userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  if (!repayment) {
    res.json({
      repayment: null,
      attempt: { success: false, reason: "no-active-loan" },
      isPending: false,
      isPartial: false,
    });
    return;
  }
  if (repayment.pendingCollectionRef) {
    throw new AppError("A mobile-money repayment is already pending", 409);
  }

  const outstanding = Number(repayment.total) - Number(repayment.amountPaid);
  const requested = req.body?.amount === undefined
    ? outstanding
    : Math.round(Number(req.body.amount));
  if (!Number.isFinite(requested) || requested <= 0 || requested > outstanding) {
    throw new AppError("Payment amount must be positive and cannot exceed the outstanding balance", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);
  if (!user.phoneVerified) throw new AppError("Verify your phone before making a repayment", 403);

  const phone = providerPhone(user.phone);
  const amount = providerAmount(requested);
  const callbackUrl = providerCallbackUrl();
  const reference = createPaymentReference();
  const attempts = jsonAttempts(repayment.attempts);

  await prisma.$transaction(async (tx) => {
    const claim = await tx.repayment.updateMany({
      where: {
        id: repayment.id,
        status: { not: "paid" },
        pendingCollectionRef: null,
      },
      data: {
        pendingCollectionRef: reference,
        attempts: [
          ...attempts,
          {
            at: new Date().toISOString(),
            method: "mobile-money-collection",
            amount,
            success: false,
            reason: "request-created",
            reference,
          },
        ] as Prisma.InputJsonValue,
      },
    });
    if (claim.count !== 1) {
      throw new AppError("A mobile-money repayment is already pending", 409);
    }

    await tx.transaction.create({
      data: {
        userId,
        loanId: repayment.loanId,
        type: "loan_payment",
        amount: BigInt(amount),
        status: "pending",
        reference,
        provider: "marzpay",
        providerStatus: "initiating",
      },
    });
  });

  const result = await collectMoney({
    phone,
    amount,
    reference,
    description: `Kuula repayment ${repayment.loanId}`,
    callbackUrl,
  });

  if (!result.accepted) {
    const current = await prisma.repayment.findUniqueOrThrow({ where: { id: repayment.id } });
    await prisma.$transaction([
      prisma.transaction.update({
        where: { reference },
        data: {
          status: "failed",
          providerStatus: result.status,
          transactionId: result.uuid || null,
          providerPayload: result.raw as Prisma.InputJsonValue,
        },
      }),
      prisma.repayment.update({
        where: { id: repayment.id },
        data: {
          pendingCollectionRef: null,
          attempts: [
            ...jsonAttempts(current.attempts),
            {
              at: new Date().toISOString(),
              method: "mobile-money-collection",
              amount,
              success: false,
              reason: "provider-request-rejected",
              reference,
              detail: result.message,
            },
          ] as Prisma.InputJsonValue,
        },
      }),
    ]);
    throw new AppError(`Mobile-money collection was not accepted: ${result.message}`, 502);
  }

  await prisma.transaction.update({
    where: { reference },
    data: {
      providerStatus: result.status || "processing",
      transactionId: result.uuid || null,
      providerPayload: result.raw as Prisma.InputJsonValue,
    },
  });

  res.json({
    repayment: {
      ...repayment,
      total: Number(repayment.total),
      amountPaid: Number(repayment.amountPaid),
      amount_paid: Number(repayment.amountPaid),
    },
    attempt: { success: false, reason: "pending-customer-approval" },
    isPending: true,
    isPartial: amount < outstanding,
    amount,
    reference,
    uuid: result.uuid,
    message: "Approve the mobile-money prompt on your phone to complete the repayment.",
  });
});

export default router;
