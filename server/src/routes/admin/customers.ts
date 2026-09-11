/**
 * Admin → Customers.
 *
 * Customers are never hard-deleted: financial history (ledger, repayments,
 * audit) must survive. "Deactivate" sets `deletedAt`, which already blocks
 * login and hides the account from the customer app.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { audit } from "../../lib/audit.js";
import { revokeAllSessions } from "../../lib/sessions.js";
import { computeCreditScore } from "../../lib/credit-score.js";
import {
  parsePage, paged, queryStr, requireUuid, str,
  mapCustomer, mapApplication, mapRepayment, mapTransaction, mapAudit, withActorNames,
} from "./shared.js";

const router = Router();

const LIVE_LOAN_STATUSES = ["disbursing", "active", "overdue"];

function customerWhere(req: Request) {
  const q = queryStr(req, "q");
  const status = queryStr(req, "status") || "all";
  const where: any = { role: "user" };

  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { nationalId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status === "active") where.deletedAt = null;
  else if (status === "deactivated") where.deletedAt = { not: null };
  else if (status === "verified") where.kycVerified = true;
  else if (status === "unverified") where.kycVerified = false;

  return where;
}

// GET /api/admin/customers
router.get("/", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const where = customerWhere(req);

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
    prisma.user.count({ where }),
  ]);

  res.json(paged(rows.map(mapCustomer), total, page));
});

// GET /api/admin/customers/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "customer id");
  const user = await prisma.user.findFirst({ where: { id, role: "user" }, include: { savingsAccount: true } });
  if (!user) throw new AppError("Customer not found", 404);

  const [applications, repayments, transactions, tickets, auditRows] = await Promise.all([
    prisma.loanApplication.findMany({ where: { applicantId: id }, orderBy: { createdAt: "desc" } }),
    prisma.repayment.findMany({ where: { userId: id }, orderBy: { dueDate: "desc" } }),
    prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.supportTicket.findMany({ where: { customerId: id }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.auditEvent.findMany({
      where: { entityType: "user", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Loan-level audit entries belong to the customer's history too.
  const loanIds = applications.map((a) => a.id);
  const loanAudit = loanIds.length
    ? await prisma.auditEvent.findMany({
        where: { entityType: "loan_application", entityId: { in: loanIds } },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];
  const allAudit = [...auditRows, ...loanAudit]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
  const actors = await withActorNames(prisma, allAudit);

  const savingsBalance = Number(user.savingsAccount?.balance ?? 0);
  const credit = computeCreditScore({
    momoMonths: user.momoMonths ?? 0,
    momoTxnCount: user.momoTxnCount ?? 0,
    crbStatus: user.crbStatus ?? "thin",
    savingsBalance,
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  });

  const completedSavings = transactions.filter((t) => t.status === "completed" && t.type.startsWith("savings_"));
  const ledgerSavings = completedSavings.reduce(
    (s, t) => s + (t.type === "savings_deposit" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  res.json({
    customer: {
      ...mapCustomer(user),
      nationalId: user.nationalId ?? null,
      crbStatus: user.crbStatus,
      momoMonths: user.momoMonths,
      momoTxnCount: user.momoTxnCount,
      kycProvider: user.kycProvider ?? null,
      kycReference: user.kycReference ?? null,
      kycReviewStatus: user.kycReviewStatus ?? null,
      kycReviewNotes: user.kycReviewNotes ?? null,
      kycReviewedAt: user.kycReviewedAt ?? null,
      hasKycDocuments: !!(user.kycDocFrontRef && user.kycDocBackRef),
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      termsVersion: user.termsVersion ?? null,
    },
    savings: user.savingsAccount
      ? {
          balance: savingsBalance,
          ledgerBalance: ledgerSavings,
          reconciled: savingsBalance === ledgerSavings,
          updatedAt: user.savingsAccount.updatedAt,
        }
      : null,
    credit,
    loans: applications.map(mapApplication),
    repayments: repayments.map(mapRepayment),
    transactions: transactions.map(mapTransaction),
    tickets: tickets.map((t) => ({
      id: t.id, subject: t.subject, status: t.status, priority: t.priority, category: t.category,
      createdAt: t.createdAt, updatedAt: t.updatedAt,
    })),
    audit: allAudit.map((e) => mapAudit(e, actors.get(e.actorId ?? "") ?? null)),
    hasLiveLoan: applications.some((a) => LIVE_LOAN_STATUSES.includes(a.status)),
  });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PATCH /api/admin/customers/:id — contact / profile metadata only.
router.patch("/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "customer id");
  const user = await prisma.user.findFirst({ where: { id, role: "user" } });
  if (!user) throw new AppError("Customer not found", 404);

  const data: Record<string, string | null> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (req.body?.fullName !== undefined) {
    const v = str(req.body.fullName);
    if (v.length < 2 || v.length > 120) throw new AppError("Full name must be 2–120 characters", 400);
    if (v !== user.fullName) { data.fullName = v; changes.fullName = { from: user.fullName, to: v }; }
  }
  if (req.body?.email !== undefined) {
    const raw = str(req.body.email).toLowerCase();
    const v = raw === "" ? null : raw;
    if (v && !EMAIL_RE.test(v)) throw new AppError("Invalid email address", 400);
    if (v !== (user.email ?? null)) {
      if (v) {
        const clash = await prisma.user.findUnique({ where: { email: v } });
        if (clash && clash.id !== id) throw new AppError("Another account already uses that email", 409);
      }
      data.email = v; changes.email = { from: user.email, to: v };
    }
  }
  if (req.body?.district !== undefined) {
    const v = str(req.body.district).slice(0, 80);
    if (v !== (user.district ?? "")) { data.district = v; changes.district = { from: user.district, to: v }; }
  }
  if (req.body?.occupation !== undefined) {
    const v = str(req.body.occupation).slice(0, 80);
    if (v !== (user.occupation ?? "")) { data.occupation = v; changes.occupation = { from: user.occupation, to: v }; }
  }

  if (Object.keys(data).length === 0) {
    res.json({ ok: true, customer: mapCustomer(user), changed: [] });
    return;
  }

  const updated = await prisma.user.update({ where: { id }, data });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "customer.updated", entityType: "user", entityId: id,
    metadata: { changes },
  });

  res.json({ ok: true, customer: mapCustomer(updated), changed: Object.keys(changes) });
});

// POST /api/admin/customers/:id/deactivate
router.post("/:id/deactivate", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "customer id");
  const reason = str(req.body?.reason);
  if (!reason) throw new AppError("A reason is required to deactivate a customer", 400);

  const user = await prisma.user.findFirst({ where: { id, role: "user" } });
  if (!user) throw new AppError("Customer not found", 404);
  if (user.deletedAt) throw new AppError("Customer is already deactivated", 409);

  const live = await prisma.loanApplication.findFirst({
    where: { applicantId: id, status: { in: LIVE_LOAN_STATUSES } },
  });
  if (live) {
    throw new AppError("This customer has a live loan. Settle or resolve it before deactivating the account.", 409);
  }

  const updated = await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  const revoked = await revokeAllSessions(id);
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "customer.deactivated", entityType: "user", entityId: id,
    metadata: { reason, sessionsRevoked: revoked },
  });

  res.json({ ok: true, customer: mapCustomer(updated) });
});

// POST /api/admin/customers/:id/reactivate
router.post("/:id/reactivate", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "customer id");
  const user = await prisma.user.findFirst({ where: { id, role: "user" } });
  if (!user) throw new AppError("Customer not found", 404);
  if (!user.deletedAt) throw new AppError("Customer is already active", 409);

  const updated = await prisma.user.update({ where: { id }, data: { deletedAt: null } });
  await audit({
    actorId: req.user!.userId, actorRole: req.user!.role,
    action: "customer.reactivated", entityType: "user", entityId: id,
    metadata: { notes: str(req.body?.notes) || null },
  });

  res.json({ ok: true, customer: mapCustomer(updated) });
});

export default router;
