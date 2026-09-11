/**
 * Admin → Loans (read side + offer withdrawal).
 *
 * Approve / reject / resubmit live in ../admin.ts because they are covered by
 * the C-06 concurrency tests. Nothing here moves money: `active` and `paid`
 * are reached only through verified provider callbacks.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { audit } from "../../lib/audit.js";
import { lockLoanApplication, LockContendedError } from "../../lib/db-lock.js";
import {
  parsePage, paged, queryStr, requireUuid, str, isUuid, num,
  mapApplication, mapRepayment, mapTransaction, mapAudit, withActorNames,
} from "./shared.js";

const router = Router();

/** Status groups exposed to the UI. */
const STATUS_GROUPS: Record<string, string[]> = {
  pending: ["pending", "resubmitted"],
  offered: ["offered"],
  disbursing: ["disbursing"],
  active: ["active"],
  overdue: ["overdue"],
  paid: ["paid"],
  rejected: ["rejected"],
  failed: ["disbursement_failed", "failed"],
  live: ["disbursing", "active", "overdue"],
  history: ["paid", "rejected", "disbursement_failed", "failed"],
};

// GET /api/admin/loans
router.get("/", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const q = queryStr(req, "q");
  const status = queryStr(req, "status") || "all";
  const where: any = {};

  if (status !== "all") {
    const statuses = STATUS_GROUPS[status];
    if (!statuses) throw new AppError("Unknown loan status filter", 400);
    where.status = { in: statuses };
  }
  if (q) {
    where.OR = [
      { applicantName: { contains: q, mode: "insensitive" } },
      { purpose: { contains: q, mode: "insensitive" } },
      { applicant: { phone: { contains: q } } },
      ...(isUuid(q) ? [{ id: q }, { applicantId: q }] : []),
      { loanId: { contains: q } },
      { disbursementRef: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.loanApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
      include: { applicant: { select: { phone: true, kycVerified: true, deletedAt: true } } },
    }),
    prisma.loanApplication.count({ where }),
  ]);

  const loanIds = rows.map((r) => r.loanId).filter((v): v is string => !!v);
  const repayments = loanIds.length
    ? await prisma.repayment.findMany({ where: { loanId: { in: loanIds } } })
    : [];
  const repByLoan = new Map(repayments.map((r) => [r.loanId, r]));

  res.json(
    paged(
      rows.map((a) => {
        const rep = a.loanId ? repByLoan.get(a.loanId) : undefined;
        return {
          ...mapApplication(a),
          applicantPhone: a.applicant?.phone ?? null,
          applicantKycVerified: !!a.applicant?.kycVerified,
          applicantActive: !a.applicant?.deletedAt,
          repayment: rep ? mapRepayment(rep) : null,
        };
      }),
      total,
      page
    )
  );
});

// GET /api/admin/loans/summary — counts per lifecycle stage for the tabs.
router.get("/summary", async (_req: Request, res: Response) => {
  const grouped = await prisma.loanApplication.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } });
  const counts: Record<string, number> = {};
  const amounts: Record<string, number> = {};
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    amounts[g.status] = num(g._sum.amount);
  }
  const outstanding = await prisma.repayment.findMany({
    where: { status: { not: "paid" } },
    select: { total: true, amountPaid: true, status: true },
  });
  res.json({
    counts,
    amounts,
    outstandingPortfolio: outstanding.reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0),
    arrears: outstanding
      .filter((r) => r.status === "overdue")
      .reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0),
  });
});

// GET /api/admin/loans/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "loan id");
  const app = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      applicant: {
        select: {
          id: true, fullName: true, phone: true, email: true, kycVerified: true,
          loansTotal: true, loansRepaid: true, deletedAt: true, createdAt: true,
        },
      },
    },
  });
  if (!app) throw new AppError("Loan application not found", 404);

  const [repayments, transactions, auditRows, approver] = await Promise.all([
    app.loanId
      ? prisma.repayment.findMany({ where: { loanId: app.loanId }, orderBy: { dueDate: "asc" } })
      : Promise.resolve([]),
    app.loanId
      ? prisma.transaction.findMany({ where: { loanId: app.loanId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.auditEvent.findMany({
      where: { entityType: "loan_application", entityId: app.id },
      orderBy: { createdAt: "desc" },
    }),
    app.approvedBy && isUuid(app.approvedBy)
      ? prisma.user.findUnique({ where: { id: app.approvedBy }, select: { fullName: true, email: true } })
      : Promise.resolve(null),
  ]);
  const actors = await withActorNames(prisma, auditRows);

  res.json({
    loan: {
      ...mapApplication(app),
      approvedByName: approver ? approver.fullName || approver.email : null,
    },
    applicant: app.applicant
      ? { ...app.applicant, active: !app.applicant.deletedAt }
      : null,
    repayments: repayments.map(mapRepayment),
    transactions: transactions.map(mapTransaction),
    audit: auditRows.map((e) => mapAudit(e, actors.get(e.actorId ?? "") ?? null)),
  });
});

/**
 * POST /api/admin/loans/:id/withdraw
 *
 * Withdraws an OFFER the borrower has not yet accepted. No money has moved at
 * this stage, so this is the only admin-side cancellation that is safe; once a
 * payout has been requested the lifecycle is driven by the provider callback.
 */
router.post("/:id/withdraw", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "loan id");
  const notes = str(req.body?.decisionNotes);
  if (!notes) throw new AppError("A reason is required to withdraw an offer", 400);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const found = await lockLoanApplication(tx, id);
      if (!found) throw new AppError("Loan application not found", 404);
      const app = await tx.loanApplication.findUniqueOrThrow({ where: { id } });
      if (app.status !== "offered") {
        throw new AppError(`Only offers awaiting acceptance can be withdrawn (current status: ${app.status}).`, 409);
      }
      if (app.acceptedAt) {
        throw new AppError("The borrower has already accepted this offer.", 409);
      }

      const row = await tx.loanApplication.update({
        where: { id },
        data: { status: "rejected", decidedAt: new Date(), decisionNotes: `Offer withdrawn: ${notes}`, approvedBy: req.user!.userId },
      });

      await tx.notification.create({
        data: {
          userId: app.applicantId,
          title: "Loan offer withdrawn",
          body: `Your loan offer for UGX ${Number(app.amount).toLocaleString()} was withdrawn: ${notes}`,
          type: "warning",
        },
      });

      await audit(
        {
          actorId: req.user!.userId, actorRole: req.user!.role,
          action: "loan.offer_withdrawn", entityType: "loan_application", entityId: id,
          metadata: { notes, amount: Number(app.amount) },
        },
        tx
      );
      return row;
    });

    res.json({ ok: true, application: mapApplication(updated) });
  } catch (err) {
    if (err instanceof LockContendedError) {
      throw new AppError("This application is being updated by another reviewer.", 409);
    }
    throw err;
  }
});

export default router;
