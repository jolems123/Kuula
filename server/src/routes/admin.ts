/**
 * Admin API.
 *
 * Every route here requires a staff token. Read models live in ./admin/*;
 * the loan decision handlers stay in this file because they are covered by
 * the C-06 concurrency tests and are the only admin actions that touch the
 * loan lifecycle.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requireRoles } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { audit } from "../lib/audit.js";
import { lockLoanApplication, LockContendedError } from "../lib/db-lock.js";
import { mapApplication } from "./admin/shared.js";
import customersRouter from "./admin/customers.js";
import loansRouter from "./admin/loans.js";
import kycRouter from "./admin/kyc.js";
import ledgerRouter from "./admin/ledger.js";
import ticketsRouter from "./admin/tickets.js";
import staffRouter from "./admin/staff.js";
import reportsRouter from "./admin/reports.js";
import systemRouter from "./admin/system.js";

const router = Router();

// Only `admin` tokens are ever issued (see /api/auth/admin-login); the extra
// roles are accepted here so a future staff tier does not need a code change.
router.use(authenticateToken, requireRoles("admin", "manager", "officer"));

router.use(systemRouter);          // /stats, /audit, /config
router.use(reportsRouter);         // /report, /investor-report
router.use(ledgerRouter);          // /transactions, /savings/*
router.use("/customers", customersRouter);
router.use("/kyc", kycRouter);
router.use("/tickets", ticketsRouter);
router.use("/staff", staffRouter);
router.use("/loans", loansRouter); // list/detail/withdraw; decisions below

/**
 * POST /api/admin/loans/:id/approve
 *
 * Approval creates an OFFER. It moves no money and books no loan.
 *
 * Before this change, approving credited `wallet.balance` with the principal
 * and wrote a `completed` disbursement transaction — the simulated payout at
 * the heart of C-01 — with no locking, so two admins clicking at once produced
 * two credits and two repayment schedules (C-06).
 *
 * Now the whole decision happens inside one transaction, behind a
 * `SELECT … FOR UPDATE NOWAIT` on the application, guarded by a status
 * precondition. The second caller — whether that is a second admin, a
 * double-click, a client retry, or another server instance — finds the
 * committed decision and gets 409.
 */
router.post("/loans/:id/approve", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const decisionNotes = (req.body?.decisionNotes ?? "").toString().trim();

  try {
    const approved = await prisma.$transaction(async (tx) => {
      const found = await lockLoanApplication(tx, id);
      if (!found) throw new AppError("Loan application not found", 404);

      const app = await tx.loanApplication.findUniqueOrThrow({ where: { id } });
      if (!["pending", "resubmitted"].includes(app.status)) {
        throw new AppError(`This application has already been decided (${app.status}).`, 409);
      }

      const updated = await tx.loanApplication.update({
        where: { id: app.id },
        data: {
          status: "offered",
          decidedAt: new Date(),
          decisionNotes: decisionNotes || "Approved",
          approvedBy: req.user!.userId,
        },
      });

      await tx.notification.create({
        data: {
          userId: app.applicantId,
          title: "Loan approved",
          body:
            `Your loan offer for UGX ${Number(app.amount).toLocaleString()} is ready. ` +
            `Accept it in the app to receive the funds on your mobile money.`,
          type: "success",
        },
      });

      await audit(
        {
          actorId: req.user!.userId,
          actorRole: req.user!.role,
          action: "loan.approved",
          entityType: "loan_application",
          entityId: app.id,
          metadata: { amount: Number(app.amount), notes: decisionNotes || null },
        },
        tx
      );

      return updated;
    });

    res.json({ ok: true, application: mapApplication(approved) });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("This application is already being decided by another reviewer.", 409);
    }
    throw err;
  }
});

router.post("/loans/:id/reject", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const decisionNotes = (req.body?.decisionNotes ?? "").toString().trim();
  if (!decisionNotes) throw new AppError("Decision notes are required to reject", 400);

  try {
    const rejected = await prisma.$transaction(async (tx) => {
      const found = await lockLoanApplication(tx, id);
      if (!found) throw new AppError("Loan application not found", 404);

      const app = await tx.loanApplication.findUniqueOrThrow({ where: { id } });
      if (!["pending", "resubmitted"].includes(app.status)) {
        throw new AppError(`This application has already been decided (${app.status}).`, 409);
      }

      const updated = await tx.loanApplication.update({
        where: { id: app.id },
        data: { status: "rejected", decidedAt: new Date(), decisionNotes, approvedBy: req.user!.userId },
      });

      await tx.notification.create({
        data: {
          userId: app.applicantId,
          title: "Loan not approved",
          body: `Your loan request was not approved: ${decisionNotes}`,
          type: "warning",
        },
      });

      await audit(
        {
          actorId: req.user!.userId,
          actorRole: req.user!.role,
          action: "loan.rejected",
          entityType: "loan_application",
          entityId: app.id,
          metadata: { notes: decisionNotes },
        },
        tx
      );

      return updated;
    });

    res.json({ ok: true, application: mapApplication(rejected) });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("This application is already being decided by another reviewer.", 409);
    }
    throw err;
  }
});

router.post("/loans/:id/resubmit", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const app = await prisma.loanApplication.findUnique({ where: { id } });
  if (!app) throw new AppError("Loan application not found", 404);

  if (app.status !== "rejected") {
    throw new AppError("Only rejected applications can be resubmitted", 400);
  }

  const resubmitted = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: "resubmitted",
      decidedAt: null,
      decisionNotes: (req.body?.decisionNotes ?? "Resubmitted for review").toString(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: resubmitted.applicantId,
      title: "Loan Resubmitted",
      body: "Your loan application was resubmitted for review.",
      type: "info",
    },
  });

  await audit({
    actorId: req.user!.userId,
    actorRole: req.user!.role,
    action: "loan.resubmitted",
    entityType: "loan_application",
    entityId: id,
    metadata: { notes: resubmitted.decisionNotes },
  });

  res.json({ ok: true, application: mapApplication(resubmitted) });
});

export default router;