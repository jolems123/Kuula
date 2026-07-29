import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { localQuote } from "../lib/pricing.js";
import { requestDisbursement } from "../lib/disbursement.js";
import { requestCollection } from "../lib/repayment.js";
import { audit } from "../lib/audit.js";
import { lockLoanApplication, LockContendedError } from "../lib/db-lock.js";

const router = Router();

/** Client-supplied dedupe key, when the app sends one. */
function idempotencyKey(req: Request): string | undefined {
  const raw = req.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value).slice(0, 200) : undefined;
}

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

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Enter a loan amount greater than zero", 400);
  }

  // One live loan at a time. The database enforces this too
  // (`loan_applications_one_live_loan_per_borrower`); checking here turns a
  // constraint violation into a clear message.
  const live = await prisma.loanApplication.findFirst({
    where: { applicantId: userId, status: { in: ["disbursing", "active", "overdue"] } },
  });
  if (live) {
    throw new AppError("You already have an active loan. Repay it before applying for another.", 409);
  }

  const quote = localQuote(amount, Number(payload.termDays), Number(user.savingsAccount?.balance ?? 0));

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

/**
 * POST /api/loans/applications/decision — admin approve/reject.
 *
 * Approval produces an OFFER and nothing else. No money moves and no loan is
 * booked here: the borrower must accept, and only a provider-confirmed payout
 * makes the loan active (C-01).
 *
 * The decision is taken under a row lock with a status precondition, so two
 * admins deciding simultaneously, a double-clicked button, and a client retry
 * all converge on one decision (C-06).
 */
router.post("/applications/decision", authenticateToken, async (req: Request, res: Response) => {
  if (req.user!.role !== "admin") throw new AppError("Admin access required", 403);

  const { id, decision, notes } = req.body;
  if (!id) throw new AppError("Application id is required", 400);
  if (decision !== "approved" && decision !== "rejected") {
    throw new AppError("Decision must be 'approved' or 'rejected'", 400);
  }
  const status = decision === "approved" ? "offered" : "rejected";

  try {
    const application = await prisma.$transaction(async (tx) => {
      const found = await lockLoanApplication(tx, String(id));
      if (!found) throw new AppError("Loan application not found", 404);

      const app = await tx.loanApplication.findUniqueOrThrow({ where: { id: String(id) } });
      if (!["pending", "resubmitted"].includes(app.status)) {
        // The second admin through sees the first admin's committed decision.
        throw new AppError(`This application has already been decided (${app.status}).`, 409);
      }

      const updated = await tx.loanApplication.update({
        where: { id: app.id },
        data: { status, decisionNotes: notes || null, decidedAt: new Date(), approvedBy: req.user!.userId },
      });

      await tx.notification.create({
        data: {
          userId: app.applicantId,
          title: decision === "approved" ? "Loan approved" : "Loan not approved",
          body:
            decision === "approved"
              ? `Your loan offer for UGX ${Number(app.amount).toLocaleString()} is ready. Accept it to receive the funds.`
              : `Your loan application was not approved.${notes ? ` ${notes}` : ""}`,
          type: decision === "approved" ? "success" : "warning",
        },
      });

      await audit(
        {
          actorId: req.user!.userId,
          actorRole: "admin",
          action: `loan.${decision}`,
          entityType: "loan_application",
          entityId: app.id,
          metadata: { amount: Number(app.amount), notes: notes || null },
        },
        tx
      );

      return updated;
    });

    res.json({ application: mapApplication(application) });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("This application is already being decided by another reviewer.", 409);
    }
    throw err;
  }
});

/**
 * POST /api/loans/:id/accept — borrower accepts an offer, triggering a REAL
 * mobile-money payout (C-01).
 *
 * Responds 202: the loan is NOT disbursed yet. It becomes active only when the
 * provider confirms the payout on the webhook.
 */
router.post("/:id/accept", authenticateToken, async (req: Request, res: Response) => {
  const result = await requestDisbursement({
    applicantId: req.user!.userId,
    applicationId: String(req.params.id),
    idempotencyKey: idempotencyKey(req),
  });

  const application = await prisma.loanApplication.findUnique({ where: { id: String(req.params.id) } });

  res.status(result.status === "failed" ? 200 : 202).json({
    application: application ? mapApplication(application) : null,
    disbursement: {
      status: result.status,
      reference: result.reference,
      providerRef: result.providerRef,
      amount: result.amount,
      message: result.message,
      needsReconciliation: result.needsReconciliation ?? false,
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

/**
 * POST /api/loans/repayment/pay — borrower initiates a REAL mobile-money
 * collection (C-02).
 *
 * Responds 202. Nothing about the loan balance changes here: this only sends a
 * request-to-pay prompt to the borrower's handset and records a pending ledger
 * row. The balance moves when — and only when — the provider confirms it on the
 * webhook.
 */
router.post("/repayment/pay", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rawAmount = req.body?.amount;
  // The client value is a cap, not an instruction; the server recomputes what
  // is actually payable under a row lock.
  const requestedAmount = rawAmount == null || rawAmount === "" ? null : Number(rawAmount);

  const result = await requestCollection({ userId, requestedAmount, idempotencyKey: idempotencyKey(req) });

  const repayment = await prisma.repayment.findFirst({
    where: { userId, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
  });

  res.status(result.status === "pending" ? 202 : 200).json({
    repayment: repayment
      ? { ...repayment, total: Number(repayment.total), amountPaid: Number(repayment.amountPaid) }
      : null,
    // The balance is unchanged until settlement, so `success` here would be a
    // lie. Callers key off `isPending`.
    attempt: { success: false, reason: result.reason },
    isPending: result.isPending,
    isPartial: result.outstanding > 0 && result.amount < result.outstanding,
    status: result.status,
    amount: result.amount,
    reference: result.reference,
    uuid: result.providerRef,
    message: result.message,
  });
});

export default router;
