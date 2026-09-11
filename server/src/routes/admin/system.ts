/**
 * Admin → System: dashboard stats, audit log, read-only platform configuration.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { COMPLIANCE } from "../../lib/compliance.js";
import { config, NODE_ENV, paymentsConfigured, smsConfigured } from "../../lib/config.js";
import { smileIdConfigured } from "../../lib/smile-id.js";
import { parsePage, paged, queryStr, num, mapApplication, mapAudit, withActorNames, isUuid } from "./shared.js";

const router = Router();

// GET /api/admin/stats — dashboard cards. Every number is a database count.
router.get("/stats", async (_req: Request, res: Response) => {
  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const [
    customers, pendingApplications, offeredLoans, activeLoans, overdueLoans,
    outstandingReps, savingsAgg, pendingKyc, pendingTx, failedTx, openTickets, recentApps,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "user", deletedAt: null } }),
    prisma.loanApplication.count({ where: { status: { in: ["pending", "resubmitted"] } } }),
    prisma.loanApplication.count({ where: { status: "offered" } }),
    prisma.loanApplication.count({ where: { status: { in: ["disbursing", "active", "overdue"] } } }),
    prisma.loanApplication.count({ where: { status: "overdue" } }),
    prisma.repayment.findMany({ where: { status: { not: "paid" } }, select: { total: true, amountPaid: true } }),
    prisma.savingsAccount.aggregate({ where: { user: { role: "user" } }, _sum: { balance: true }, _count: { _all: true } }),
    prisma.user.count({
      where: {
        role: "user", kycSubmittedAt: { not: null }, kycVerified: false,
        OR: [{ kycReviewStatus: null }, { kycReviewStatus: { not: "rejected" } }],
      },
    }),
    prisma.transaction.count({ where: { status: "pending" } }),
    prisma.transaction.count({ where: { status: "failed", createdAt: { gte: since7d } } }),
    prisma.supportTicket.count({ where: { status: { in: ["open", "pending"] } } }),
    prisma.loanApplication.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  res.json({
    customers,
    pendingApplications,
    offeredLoans,
    activeLoans,
    overdueLoans,
    outstandingPortfolio: outstandingReps.reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0),
    savingsTotal: num(savingsAgg._sum.balance),
    savingsAccounts: savingsAgg._count._all,
    pendingKyc,
    transactionsAttention: { pending: pendingTx, failedLast7d: failedTx },
    openTickets,
    recentApplications: recentApps.map(mapApplication),
    generatedAt: new Date().toISOString(),
  });
});

// GET /api/admin/audit
router.get("/audit", async (req: Request, res: Response) => {
  const page = parsePage(req, 50);
  const action = queryStr(req, "action");
  const entityType = queryStr(req, "entityType");
  const entityId = queryStr(req, "entityId");
  const actorId = queryStr(req, "actorId");
  const where: any = {};
  if (action) where.action = action.endsWith(".") ? { startsWith: action } : action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorId && isUuid(actorId)) where.actorId = actorId;

  const [rows, total] = await Promise.all([
    prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
    prisma.auditEvent.count({ where }),
  ]);
  const actors = await withActorNames(prisma, rows);

  res.json(paged(rows.map((e) => mapAudit(e, actors.get(e.actorId ?? "") ?? null)), total, page));
});

// GET /api/admin/config — what the server is actually running with. Read-only:
// these values are environment-driven and cannot be changed from the portal.
router.get("/config", async (_req: Request, res: Response) => {
  const smile = smileIdConfigured();
  const [webhookLast, migrations] = await Promise.all([
    prisma.webhookEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true, status: true } }),
    prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 1
    `.catch(() => []),
  ]);

  res.json({
    environment: NODE_ENV,
    pricing: {
      maxAprPercent: COMPLIANCE.maxAprPercent,
      minTermDays: COMPLIANCE.minTermDays,
      savingsAprPercent: COMPLIANCE.savingsAprPercent,
      savingsDiscountPercent: COMPLIANCE.savingsDiscountPercent,
      savingsThreshold: COMPLIANCE.savingsThreshold,
      compound: COMPLIANCE.compound,
      dataRetentionYears: COMPLIANCE.dataRetentionYears,
    },
    providers: {
      payments: {
        name: "MarzPay",
        configured: paymentsConfigured(),
        webhookMode: config.marzpay.webhookMode,
        verifyCallbacks: config.marzpay.verifyCallbacks,
        callbackBaseUrl: config.publicApiBaseUrl || null,
        lastWebhookAt: webhookLast?.receivedAt ?? null,
        lastWebhookStatus: webhookLast?.status ?? null,
      },
      sms: {
        provider: config.sms.provider || null,
        configured: smsConfigured(),
        senderId: config.sms.senderId || null,
      },
      kyc: {
        name: "Smile ID",
        configured: smile.configured,
        environment: smile.environment,
      },
    },
    auth: {
      accessTokenTtl: config.auth.accessTokenTtl,
      refreshTokenTtlDays: Math.round(config.auth.refreshTokenTtlMs / 86_400_000),
      otpTtlSeconds: Math.round(config.otp.ttlMs / 1000),
      otpMaxAttempts: config.otp.maxAttempts,
    },
    database: {
      lastMigration: migrations[0]?.migration_name ?? null,
      lastMigrationAt: migrations[0]?.finished_at ?? null,
    },
  });
});

export default router;
