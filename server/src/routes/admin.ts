import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();

router.use(authenticateToken, requireAdmin);

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

// GET /api/admin/investor-report
router.get("/investor-report", async (req: Request, res: Response) => {
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

  res.json({
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
  });
});

export default router;
