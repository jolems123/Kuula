import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";

const router = Router();
const CUSTOMER_ROLES = ["user", "customer"];

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
    offerExpiresAt: a.offerExpiresAt ?? null,
  };
}

router.get("/stats", authenticateToken, requirePermissions("report.view"), async (_req: Request, res: Response) => {
  const [customerCount, pendingCount, overdueCount, recentApps, allRecent] = await Promise.all([
    prisma.user.count({ where: { role: { in: CUSTOMER_ROLES }, deletedAt: null } }),
    prisma.loanApplication.count({ where: { status: "pending" } }),
    prisma.loanApplication.count({ where: { status: "overdue" } }),
    prisma.loanApplication.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.loanApplication.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 180 * 86400000) } },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
  ]);

  const monthMap: Record<string, { loans: number; amount: number }> = {};
  for (const row of allRecent) {
    const month = new Date(row.createdAt).toLocaleString("en-UG", { month: "short" });
    if (!monthMap[month]) monthMap[month] = { loans: 0, amount: 0 };
    monthMap[month].loans += 1;
    monthMap[month].amount += Math.round(Number(row.amount) / 1_000_000);
  }
  res.json({
    totalCustomers: customerCount,
    pendingApprovals: pendingCount,
    overdueLoans: overdueCount,
    recentApplications: recentApps.map(mapApplication),
    monthlyChart: Object.entries(monthMap).map(([month, value]) => ({ month, ...value })),
  });
});

router.get("/customers", authenticateToken, requirePermissions("customer.view"), async (req: Request, res: Response) => {
  const take = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const customers = await prisma.user.findMany({
    where: { role: { in: CUSTOMER_ROLES }, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      verified: true,
      kycVerified: true,
      loansTotal: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  res.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      verified: customer.verified,
      kyc_verified: customer.kycVerified,
      loans_total: customer.loansTotal,
      created_at: customer.createdAt,
    })),
  });
});

async function buildInvestorReportPayload() {
  const [transactions, applications, repayments, profiles] = await Promise.all([
    prisma.transaction.findMany({ select: { type: true, amount: true, status: true, createdAt: true } }),
    prisma.loanApplication.findMany({ select: { amount: true, interest: true, status: true, createdAt: true } }),
    prisma.repayment.findMany({ select: { total: true, amountPaid: true, status: true } }),
    prisma.user.findMany({ where: { role: { in: CUSTOMER_ROLES }, deletedAt: null }, select: { verified: true, createdAt: true } }),
  ]);

  const number = (value: any) => Number(value) || 0;
  const completedTransactions = transactions.filter((transaction) => transaction.status === "completed");
  const sumTransactions = (type: string) => completedTransactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + number(transaction.amount), 0);
  const totalDisbursed = sumTransactions("loan_disbursement");
  const totalCollected = sumTransactions("loan_payment");

  const countBy = (status: string) => applications.filter((application) => application.status === status).length;
  const pending = countBy("pending");
  const offered = countBy("offered");
  const disbursing = countBy("disbursing");
  const active = countBy("active");
  const paid = countBy("paid");
  const overdue = countBy("overdue");
  const rejected = countBy("rejected");
  const bookedStatuses = ["active", "paid", "overdue"];

  const disbursedPrincipal = applications.filter((application) => bookedStatuses.includes(application.status)).reduce((sum, application) => sum + number(application.amount), 0);
  const realizedInterest = applications.filter((application) => application.status === "paid").reduce((sum, application) => sum + number(application.interest), 0);
  const expectedInterest = applications.filter((application) => bookedStatuses.includes(application.status)).reduce((sum, application) => sum + number(application.interest), 0);
  const outstanding = repayments.filter((repayment) => repayment.status !== "paid").reduce((sum, repayment) => sum + Math.max(number(repayment.total) - number(repayment.amountPaid), 0), 0);
  const parOutstanding = repayments.filter((repayment) => repayment.status === "overdue").reduce((sum, repayment) => sum + Math.max(number(repayment.total) - number(repayment.amountPaid), 0), 0);

  const concludedOrLive = active + paid + overdue;
  const percent = (numerator: number, denominator: number) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  const now = new Date();
  const months: { key: string; monthLabel: string; disbursed: number; collected: number; newCustomers: number }[] = [];
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push({ key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, monthLabel: date.toLocaleString("en-UG", { month: "short", year: "2-digit" }), disbursed: 0, collected: 0, newCustomers: 0 });
  }
  for (const transaction of completedTransactions) {
    const date = new Date(transaction.createdAt);
    const bucket = months.find((month) => month.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    if (!bucket) continue;
    if (transaction.type === "loan_disbursement") bucket.disbursed += number(transaction.amount);
    else if (transaction.type === "loan_payment") bucket.collected += number(transaction.amount);
  }
  for (const profile of profiles) {
    const date = new Date(profile.createdAt);
    const bucket = months.find((month) => month.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    if (bucket) bucket.newCustomers += 1;
  }

  const dayKey = (date: Date) => date.toDateString();
  const todayKey = now.toDateString();
  const applicationsToday = applications.filter((application) => dayKey(application.createdAt) === todayKey);
  const transactionsToday = completedTransactions.filter((transaction) => dayKey(transaction.createdAt) === todayKey);
  const dayBuckets: { key: string; day: string; applications: number; approved: number; disbursed: number; collected: number }[] = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    dayBuckets.push({ key: date.toDateString(), day: date.toLocaleDateString("en-UG", { weekday: "short" }), applications: 0, approved: 0, disbursed: 0, collected: 0 });
  }
  for (const application of applications) {
    const bucket = dayBuckets.find((day) => day.key === dayKey(application.createdAt));
    if (!bucket) continue;
    bucket.applications += 1;
    if (bookedStatuses.includes(application.status)) bucket.approved += 1;
  }
  for (const transaction of completedTransactions) {
    const bucket = dayBuckets.find((day) => day.key === dayKey(transaction.createdAt));
    if (!bucket) continue;
    if (transaction.type === "loan_disbursement") bucket.disbursed += number(transaction.amount);
    else if (transaction.type === "loan_payment") bucket.collected += number(transaction.amount);
  }

  return {
    generatedAt: new Date().toISOString(),
    customers: { total: profiles.length, verified: profiles.filter((profile) => profile.verified).length, newThisMonth: profiles.filter((profile) => new Date(profile.createdAt).getTime() >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).length },
    loans: { total: applications.length, pending, offered, disbursing, active, paid, overdue, rejected, disbursedPrincipal, outstanding },
    revenue: { totalDisbursed, totalCollected, realizedInterest, expectedInterest },
    ratios: { defaultRatePct: percent(overdue, concludedOrLive), repaymentRatePct: percent(paid, concludedOrLive), parPct: percent(parOutstanding, outstanding) },
    monthly: months.map((month) => ({ month: month.monthLabel, disbursed: month.disbursed, collected: month.collected, newCustomers: month.newCustomers })),
    today: {
      applications: applicationsToday.length,
      approved: applicationsToday.filter((application) => bookedStatuses.includes(application.status)).length,
      rejected: applicationsToday.filter((application) => application.status === "rejected").length,
      disbursed: transactionsToday.filter((transaction) => transaction.type === "loan_disbursement").reduce((sum, transaction) => sum + number(transaction.amount), 0),
      collected: transactionsToday.filter((transaction) => transaction.type === "loan_payment").reduce((sum, transaction) => sum + number(transaction.amount), 0),
    },
    daily: dayBuckets.map((bucket) => ({ day: bucket.day, applications: bucket.applications, approved: bucket.approved, disbursed: bucket.disbursed, collected: bucket.collected })),
  };
}

router.get("/investor-report", authenticateToken, requirePermissions("report.view"), async (_req: Request, res: Response) => {
  res.json(await buildInvestorReportPayload());
});
router.get("/report", authenticateToken, requirePermissions("report.view"), async (_req: Request, res: Response) => {
  res.json(await buildInvestorReportPayload());
});

function legacyDecisionRemoved(_req: Request, res: Response): void {
  res.status(410).json({
    error: "This legacy decision route is disabled. Use the canonical underwriting decision API.",
    canonicalEndpoint: "/api/loans/applications/decision",
  });
}
router.post("/loans/:id/approve", authenticateToken, requirePermissions("loan.approve"), legacyDecisionRemoved);
router.post("/loans/:id/reject", authenticateToken, requirePermissions("loan.approve"), legacyDecisionRemoved);
router.post("/loans/:id/resubmit", authenticateToken, requirePermissions("loan.review"), legacyDecisionRemoved);

export default router;
