import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requirePermissions } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { forecastInflows, summarizePortfolio, type BookedLoan } from "../lib/portfolio.js";
import { getMarzPayAvailableBalanceUgx, marzPayLookupConfigured } from "../lib/marzpay.js";

const router = Router();
const CUSTOMER_ROLES = ["user", "customer"];
// Single-leg (legacy) and split (current) payouts are both disbursements.
const DISBURSEMENT_TYPES = new Set(["loan_disbursement", "loan_disbursement_leg"]);

/** Every loan that was actually paid out, with its repayment position. */
async function bookedLoans(): Promise<BookedLoan[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; amount: bigint; interest: bigint; total: bigint; amount_paid: bigint | null; repayment_total: bigint | null; due_date: Date | null; disbursed_at: Date | null; sector: string | null }>>`
    SELECT a.id, a.amount, a.interest, a.total, r.amount_paid, r.total AS repayment_total, COALESCE(r.due_date, a.due_date) AS due_date,
           COALESCE(b.completed_at, r.created_at) AS disbursed_at, a.business_profile->>'sector' AS sector
    FROM loan_applications a
    LEFT JOIN repayments r ON r.user_id=a.applicant_id AND r.loan_id=a.loan_id
    LEFT JOIN disbursement_batches b ON b.application_id=a.id AND b.status='settled'
    WHERE a.status IN ('active','paid','overdue')
  `;
  return rows.map((row) => ({
    applicationId: row.id,
    principal: Number(row.amount),
    interest: Number(row.interest),
    total: Number(row.repayment_total ?? row.total),
    amountPaid: Number(row.amount_paid ?? 0),
    disbursedAt: row.disbursed_at,
    dueDate: row.due_date,
    sector: row.sector,
  }));
}

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

// Liquidity: MarzPay wallet balance, money already committed to payouts, and expected
// repayments by week from actual due dates. Every figure comes from live records.
router.get("/liquidity", authenticateToken, requirePermissions("report.view"), async (_req: Request, res: Response) => {
  const [booked, committedRows, balance] = await Promise.all([
    bookedLoans(),
    prisma.$queryRaw<Array<{ awaiting: bigint | null; in_flight: bigint | null }>>`
      SELECT COALESCE(SUM(approved_amount) FILTER (WHERE status='awaiting_release'),0)::bigint AS awaiting,
             COALESCE(SUM(total_planned - total_settled) FILTER (WHERE status IN ('planned','processing','partially_disbursed','attention_required')),0)::bigint AS in_flight
      FROM disbursement_batches`,
    marzPayLookupConfigured() ? getMarzPayAvailableBalanceUgx() : Promise.resolve(null),
  ]);
  const awaitingRelease = Number(committedRows[0]?.awaiting ?? 0);
  const inFlight = Number(committedRows[0]?.in_flight ?? 0);
  const forecast = forecastInflows(booked, new Date(), 12);
  res.json({
    generatedAt: new Date().toISOString(),
    wallet: { availableUgx: balance, source: balance === null ? "unavailable" : "marzpay" },
    committed: { awaitingRelease, inFlight, total: awaitingRelease + inFlight },
    freeAfterCommitments: balance === null ? null : balance - awaitingRelease - inFlight,
    expectedInflows: forecast,
    portfolioOutstanding: summarizePortfolio(booked).outstanding,
  });
});

router.get("/stats", authenticateToken, requirePermissions("report.view"), async (_req: Request, res: Response) => {
  const [customerCount, pendingCount, booked, recentApps, allRecent] = await Promise.all([
    prisma.user.count({ where: { role: { in: CUSTOMER_ROLES }, deletedAt: null } }),
    prisma.loanApplication.count({ where: { status: "pending" } }),
    bookedLoans(),
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
    overdueLoans: summarizePortfolio(booked).overdueLoans,
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

export function reportRange(req: Request): { start?: Date; end?: Date; label: string } {
  const rawStart = typeof req.query.start === "string" ? req.query.start : "";
  const rawEnd = typeof req.query.end === "string" ? req.query.end : "";
  const start = rawStart ? new Date(`${rawStart}T00:00:00.000Z`) : undefined;
  const end = rawEnd ? new Date(`${rawEnd}T23:59:59.999Z`) : undefined;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) throw new AppError("Invalid report date", 400);
  if (start && end && start > end) throw new AppError("Report start date must be on or before end date", 400);
  return { start, end, label: start || end ? `${rawStart || "Beginning"} to ${rawEnd || "Today"}` : "All time" };
}

async function buildInvestorReportPayload(range: { start?: Date; end?: Date; label: string }) {
  const dateFilter = range.start || range.end ? { gte: range.start, lte: range.end } : undefined;
  const [transactions, applications, booked, profiles] = await Promise.all([
    prisma.transaction.findMany({ where: dateFilter ? { createdAt: dateFilter } : undefined, select: { id: true, type: true, amount: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.loanApplication.findMany({ where: dateFilter ? { createdAt: dateFilter } : undefined, select: { id: true, applicantName: true, amount: true, interest: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    bookedLoans(),
    prisma.user.findMany({ where: { role: { in: CUSTOMER_ROLES }, deletedAt: null, ...(dateFilter ? { createdAt: dateFilter } : {}) }, select: { verified: true, createdAt: true } }),
  ]);

  const number = (value: any) => Number(value) || 0;
  const completedTransactions = transactions.filter((transaction) => transaction.status === "completed");
  const sumTransactions = (type: string) => completedTransactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + number(transaction.amount), 0);
  const totalDisbursed = completedTransactions
    .filter((transaction) => DISBURSEMENT_TYPES.has(transaction.type))
    .reduce((sum, transaction) => sum + number(transaction.amount), 0);
  const totalCollected = sumTransactions("loan_payment");

  const countBy = (status: string) => applications.filter((application) => application.status === status).length;
  const pending = countBy("pending");
  const offered = countBy("offered");
  const disbursing = countBy("disbursing");
  const active = countBy("active");
  const paid = countBy("paid");
  // Loan applications are never moved to an "overdue" status; lateness comes from due dates.
  const portfolio = summarizePortfolio(booked, new Date());
  const overdue = portfolio.overdueLoans;
  const rejected = countBy("rejected");
  const bookedStatuses = ["active", "paid", "overdue"];

  const disbursedPrincipal = applications.filter((application) => bookedStatuses.includes(application.status)).reduce((sum, application) => sum + number(application.amount), 0);
  const realizedInterest = applications.filter((application) => application.status === "paid").reduce((sum, application) => sum + number(application.interest), 0);
  const expectedInterest = applications.filter((application) => bookedStatuses.includes(application.status)).reduce((sum, application) => sum + number(application.interest), 0);
  const outstanding = portfolio.outstanding;

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
    if (DISBURSEMENT_TYPES.has(transaction.type)) bucket.disbursed += number(transaction.amount);
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
    if (DISBURSEMENT_TYPES.has(transaction.type)) bucket.disbursed += number(transaction.amount);
    else if (transaction.type === "loan_payment") bucket.collected += number(transaction.amount);
  }

  return {
    generatedAt: new Date().toISOString(),
    period: range,
    generatedBy: null,
    customers: { total: profiles.length, verified: profiles.filter((profile) => profile.verified).length, newThisMonth: profiles.filter((profile) => new Date(profile.createdAt).getTime() >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).length },
    loans: { total: applications.length, pending, offered, disbursing, active, paid, overdue, rejected, disbursedPrincipal, outstanding },
    revenue: { totalDisbursed, totalCollected, realizedInterest, expectedInterest },
    ratios: { defaultRatePct: portfolio.defaultRatePct, repaymentRatePct: portfolio.repaymentRatePct, parPct: portfolio.par[0]?.pct ?? 0 },
    portfolio: { par: portfolio.par, overdueOutstanding: portfolio.overdueOutstanding, vintages: portfolio.vintages, sectors: portfolio.sectors },
    monthly: months.map((month) => ({ month: month.monthLabel, disbursed: month.disbursed, collected: month.collected, newCustomers: month.newCustomers })),
    today: {
      applications: applicationsToday.length,
      approved: applicationsToday.filter((application) => bookedStatuses.includes(application.status)).length,
      rejected: applicationsToday.filter((application) => application.status === "rejected").length,
      disbursed: transactionsToday.filter((transaction) => DISBURSEMENT_TYPES.has(transaction.type)).reduce((sum, transaction) => sum + number(transaction.amount), 0),
      collected: transactionsToday.filter((transaction) => transaction.type === "loan_payment").reduce((sum, transaction) => sum + number(transaction.amount), 0),
    },
    daily: dayBuckets.map((bucket) => ({ day: bucket.day, applications: bucket.applications, approved: bucket.approved, disbursed: bucket.disbursed, collected: bucket.collected })),
    rows: applications.map((application) => ({ id: application.id, customer: application.applicantName, date: application.createdAt, amount: number(application.amount), interest: number(application.interest), status: application.status })),
    transactions: transactions.map((transaction) => ({ id: transaction.id, date: transaction.createdAt, type: transaction.type, amount: number(transaction.amount), status: transaction.status })),
  };
}

router.get("/investor-report", authenticateToken, requirePermissions("report.view"), async (req: Request, res: Response) => {
  const report = await buildInvestorReportPayload(reportRange(req));
  const staff = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
  res.json({ ...report, generatedBy: staff?.fullName || "Kuula staff" });
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
