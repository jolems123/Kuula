import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requireRoles } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { audit } from "../lib/audit.js";
import { lockLoanApplication, LockContendedError } from "../lib/db-lock.js";

const router = Router();

router.use(authenticateToken, requireRoles("admin", "manager", "officer"));

function mapApplication(a: any) {
  return {
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
  };
}

// GET /api/admin/stats
router.get("/stats", async (req: Request, res: Response) => {
  const [customerCount, pendingCount, overdueCount, recentApps, allRecent] = await Promise.all([
    prisma.user.count({ where: { role: "user" } }),
    prisma.loanApplication.count({ where: { status: "pending" } }),
    prisma.loanApplication.count({ where: { status: "overdue" } }),
    prisma.loanApplication.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.loanApplication.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 180 * 86400000) } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const monthMap: Record<string, { loans: number; amount: number }> = {};
  for (const row of allRecent) {
    const month = new Date(row.createdAt).toLocaleString("en-US", { month: "short" });
    if (!monthMap[month]) monthMap[month] = { loans: 0, amount: 0 };
    monthMap[month].loans += 1;
    monthMap[month].amount += Math.round(Number(row.amount) / 1_000_000);
  }

  res.json({
    totalCustomers: customerCount,
    pendingApprovals: pendingCount,
    overdueLoans: overdueCount,
    recentApplications: recentApps.map(mapApplication),
    monthlyChart: Object.entries(monthMap).map(([month, v]) => ({ month, ...v })),
  });
});

// GET /api/admin/customers
router.get("/customers", async (req: Request, res: Response) => {
  const customers = await prisma.user.findMany({
    where: { role: "user" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      verified: true,
      loansTotal: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    customers: customers.map((c) => ({
      id: c.id,
      full_name: c.fullName,
      phone: c.phone,
      email: c.email,
      verified: c.verified,
      loans_total: c.loansTotal,
      created_at: c.createdAt,
    })),
  });
});

// GET /api/admin/savings-overview
router.get("/savings-overview", async (req: Request, res: Response) => {
  const accounts = await prisma.savingsAccount.findMany({
    include: { user: { select: { fullName: true } } },
    orderBy: { balance: "desc" },
    take: 50,
  });

  const data = accounts.map((a) => ({
    user_id: a.userId,
    full_name: a.user.fullName,
    balance: Number(a.balance),
  }));

  res.json({
    accounts: data,
    total: data.reduce((s, a) => s + a.balance, 0),
  });
});

// Build investor report payload shared by both /investor-report and legacy /report paths
async function buildInvestorReportPayload() {
  const [txns, apps, reps, savings, profileRows] = await Promise.all([
    prisma.transaction.findMany({ select: { type: true, amount: true, status: true, createdAt: true } }),
    prisma.loanApplication.findMany({ select: { amount: true, interest: true, status: true, createdAt: true } }),
    prisma.repayment.findMany({ select: { total: true, amountPaid: true, status: true } }),
    prisma.savingsAccount.findMany({ select: { balance: true } }),
    prisma.user.findMany({ where: { role: "user" }, select: { verified: true, createdAt: true } }),
  ]);

  const num = (v: any) => Number(v) || 0;
  const completed = txns.filter((t) => t.status === "completed");
  const sumTx = (type: string) =>
    completed.filter((t) => t.type === type).reduce((s, t) => s + num(t.amount), 0);

  const totalDisbursed = sumTx("loan_disbursement");
  const totalCollected = sumTx("loan_payment");
  const savingsDeposits = sumTx("savings_deposit");
  const savingsWithdrawals = sumTx("savings_withdrawal");

  const allApps = apps;
  const countBy = (s: string) => allApps.filter((a) => a.status === s).length;
  const pending = countBy("pending");
  const approved = countBy("approved");
  const active = countBy("active") + approved;
  const paid = countBy("paid");
  const overdue = countBy("overdue");
  const rejected = countBy("rejected");
  const bookedStatuses = ["approved", "active", "paid", "overdue"];
  const disbursedPrincipal = allApps
    .filter((a) => bookedStatuses.includes(a.status))
    .reduce((s, a) => s + num(a.amount), 0);
  const realizedInterest = allApps
    .filter((a) => a.status === "paid")
    .reduce((s, a) => s + num(a.interest), 0);
  const expectedInterest = allApps
    .filter((a) => bookedStatuses.includes(a.status))
    .reduce((s, a) => s + num(a.interest), 0);

  const outstanding = reps
    .filter((r) => r.status !== "paid")
    .reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0);
  const parOutstanding = reps
    .filter((r) => r.status === "overdue")
    .reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0);

  const totalSavings = savings.reduce((s, a) => s + num(a.balance), 0);
  const concludedOrLive = active + paid + overdue;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const defaultRatePct = pct(overdue, concludedOrLive);
  const repaymentRatePct = pct(paid, concludedOrLive);
  const parPct = pct(parOutstanding, outstanding);

  // Monthly aggregation
  const now = new Date();
  const months: { key: string; monthLabel: string; disbursed: number; collected: number; newCustomers: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      monthLabel: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      disbursed: 0, collected: 0, newCustomers: 0,
    });
  }

  for (const t of completed) {
    const d = new Date(t.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((m) => m.key === key);
    if (!bucket) continue;
    if (t.type === "loan_disbursement") bucket.disbursed += num(t.amount);
    else if (t.type === "loan_payment") bucket.collected += num(t.amount);
  }

  for (const p of profileRows) {
    const d = new Date(p.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.newCustomers += 1;
  }

  // Today
  const dayKeyOf = (d: Date) => d.toDateString();
  const todayKey = now.toDateString();
  const appsToday = allApps.filter((a) => dayKeyOf(a.createdAt) === todayKey);
  const txToday = completed.filter((t) => dayKeyOf(t.createdAt) === todayKey);

  // Last 7 days
  const dayBuckets: { key: string; day: string; applications: number; approved: number; disbursed: number; collected: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dayBuckets.push({ key: d.toDateString(), day: d.toLocaleDateString("en-US", { weekday: "short" }), applications: 0, approved: 0, disbursed: 0, collected: 0 });
  }

  for (const a of allApps) {
    const b = dayBuckets.find((b) => b.key === dayKeyOf(a.createdAt));
    if (!b) continue;
    b.applications += 1;
    if (bookedStatuses.includes(a.status)) b.approved += 1;
  }
  for (const t of completed) {
    const b = dayBuckets.find((b) => b.key === dayKeyOf(t.createdAt));
    if (!b) continue;
    if (t.type === "loan_disbursement") b.disbursed += num(t.amount);
    else if (t.type === "loan_payment") b.collected += num(t.amount);
  }

  return {
    generatedAt: new Date().toISOString(),
    customers: {
      total: profileRows.length,
      verified: profileRows.filter((p) => p.verified).length,
      newThisMonth: profileRows.filter((p) => new Date(p.createdAt).getTime() >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).length,
    },
    loans: { total: allApps.length, pending, active, paid, overdue, rejected, disbursedPrincipal, outstanding },
    revenue: { totalDisbursed, totalCollected, realizedInterest, expectedInterest },
    savings: { total: totalSavings, accounts: savings.length, deposits: savingsDeposits, withdrawals: savingsWithdrawals },
    ratios: { defaultRatePct, repaymentRatePct, parPct },
    monthly: months.map((m) => ({ month: m.monthLabel, disbursed: m.disbursed, collected: m.collected, newCustomers: m.newCustomers })),
    today: {
      applications: appsToday.length,
      approved: appsToday.filter((a) => bookedStatuses.includes(a.status)).length,
      rejected: appsToday.filter((a) => a.status === "rejected").length,
      disbursed: txToday.filter((t) => t.type === "loan_disbursement").reduce((s, t) => s + num(t.amount), 0),
      collected: txToday.filter((t) => t.type === "loan_payment").reduce((s, t) => s + num(t.amount), 0),
    },
    daily: dayBuckets.map((b) => ({ day: b.day, applications: b.applications, approved: b.approved, disbursed: b.disbursed, collected: b.collected })),
  };
}

// GET /api/admin/investor-report
router.get("/investor-report", async (_req: Request, res: Response) => {
  const report = await buildInvestorReportPayload();
  res.json(report);
});

// GET /api/admin/report (legacy alias for backward compatibility)
router.get("/report", async (_req: Request, res: Response) => {
  const report = await buildInvestorReportPayload();
  res.json(report);
});

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

  res.json({ ok: true, application: mapApplication(resubmitted) });
});

export default router;
