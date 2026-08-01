import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken, requireRoles } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

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

router.get("/stats", async (_req: Request, res: Response) => {
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
    monthlyChart: Object.entries(monthMap).map(([month, value]) => ({ month, ...value })),
  });
});

router.get("/customers", async (_req: Request, res: Response) => {
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
    customers: customers.map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      verified: customer.verified,
      loans_total: customer.loansTotal,
      created_at: customer.createdAt,
    })),
  });
});

router.get("/savings-overview", async (_req: Request, res: Response) => {
  const accounts = await prisma.savingsAccount.findMany({
    include: { user: { select: { fullName: true } } },
    orderBy: { balance: "desc" },
    take: 50,
  });

  const data = accounts.map((account) => ({
    user_id: account.userId,
    full_name: account.user.fullName,
    balance: Number(account.balance),
  }));

  res.json({
    accounts: data,
    total: data.reduce((sum, account) => sum + account.balance, 0),
  });
});

async function buildInvestorReportPayload() {
  const [transactions, applications, repayments, savings, profiles] = await Promise.all([
    prisma.transaction.findMany({ select: { type: true, amount: true, status: true, createdAt: true } }),
    prisma.loanApplication.findMany({ select: { amount: true, interest: true, status: true, createdAt: true } }),
    prisma.repayment.findMany({ select: { total: true, amountPaid: true, status: true } }),
    prisma.savingsAccount.findMany({ select: { balance: true } }),
    prisma.user.findMany({ where: { role: "user" }, select: { verified: true, createdAt: true } }),
  ]);

  const number = (value: any) => Number(value) || 0;
  const completedTransactions = transactions.filter((transaction) => transaction.status === "completed");
  const sumTransactions = (type: string) => completedTransactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + number(transaction.amount), 0);

  const totalDisbursed = sumTransactions("loan_disbursement");
  const totalCollected = sumTransactions("loan_payment");
  const savingsDeposits = sumTransactions("savings_deposit");
  const savingsWithdrawals = sumTransactions("savings_withdrawal");

  const countBy = (status: string) => applications.filter((application) => application.status === status).length;
  const pending = countBy("pending");
  const offered = countBy("offered");
  const disbursing = countBy("disbursing");
  const active = countBy("active");
  const paid = countBy("paid");
  const overdue = countBy("overdue");
  const rejected = countBy("rejected");
  const bookedStatuses = ["active", "paid", "overdue"];

  const disbursedPrincipal = applications
    .filter((application) => bookedStatuses.includes(application.status))
    .reduce((sum, application) => sum + number(application.amount), 0);
  const realizedInterest = applications
    .filter((application) => application.status === "paid")
    .reduce((sum, application) => sum + number(application.interest), 0);
  const expectedInterest = applications
    .filter((application) => bookedStatuses.includes(application.status))
    .reduce((sum, application) => sum + number(application.interest), 0);

  const outstanding = repayments
    .filter((repayment) => repayment.status !== "paid")
    .reduce((sum, repayment) => sum + Math.max(number(repayment.total) - number(repayment.amountPaid), 0), 0);
  const parOutstanding = repayments
    .filter((repayment) => repayment.status === "overdue")
    .reduce((sum, repayment) => sum + Math.max(number(repayment.total) - number(repayment.amountPaid), 0), 0);

  const totalSavings = savings.reduce((sum, account) => sum + number(account.balance), 0);
  const concludedOrLive = active + paid + overdue;
  const percent = (numerator: number, denominator: number) => denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : 0;
  const defaultRatePct = percent(overdue, concludedOrLive);
  const repaymentRatePct = percent(paid, concludedOrLive);
  const parPct = percent(parOutstanding, outstanding);

  const now = new Date();
  const months: { key: string; monthLabel: string; disbursed: number; collected: number; newCustomers: number }[] = [];
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      monthLabel: date.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      disbursed: 0,
      collected: 0,
      newCustomers: 0,
    });
  }

  for (const transaction of completedTransactions) {
    const date = new Date(transaction.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((month) => month.key === key);
    if (!bucket) continue;
    if (transaction.type === "loan_disbursement") bucket.disbursed += number(transaction.amount);
    else if (transaction.type === "loan_payment") bucket.collected += number(transaction.amount);
  }

  for (const profile of profiles) {
    const date = new Date(profile.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((month) => month.key === key);
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
    dayBuckets.push({
      key: date.toDateString(),
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      applications: 0,
      approved: 0,
      disbursed: 0,
      collected: 0,
    });
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
    customers: {
      total: profiles.length,
      verified: profiles.filter((profile) => profile.verified).length,
      newThisMonth: profiles.filter((profile) => new Date(profile.createdAt).getTime() >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).length,
    },
    loans: {
      total: applications.length,
      pending,
      offered,
      disbursing,
      active,
      paid,
      overdue,
      rejected,
      disbursedPrincipal,
      outstanding,
    },
    revenue: { totalDisbursed, totalCollected, realizedInterest, expectedInterest },
    savings: { total: totalSavings, accounts: savings.length, deposits: savingsDeposits, withdrawals: savingsWithdrawals },
    ratios: { defaultRatePct, repaymentRatePct, parPct },
    monthly: months.map((month) => ({
      month: month.monthLabel,
      disbursed: month.disbursed,
      collected: month.collected,
      newCustomers: month.newCustomers,
    })),
    today: {
      applications: applicationsToday.length,
      approved: applicationsToday.filter((application) => bookedStatuses.includes(application.status)).length,
      rejected: applicationsToday.filter((application) => application.status === "rejected").length,
      disbursed: transactionsToday
        .filter((transaction) => transaction.type === "loan_disbursement")
        .reduce((sum, transaction) => sum + number(transaction.amount), 0),
      collected: transactionsToday
        .filter((transaction) => transaction.type === "loan_payment")
        .reduce((sum, transaction) => sum + number(transaction.amount), 0),
    },
    daily: dayBuckets.map((bucket) => ({
      day: bucket.day,
      applications: bucket.applications,
      approved: bucket.approved,
      disbursed: bucket.disbursed,
      collected: bucket.collected,
    })),
  };
}

router.get("/investor-report", async (_req: Request, res: Response) => {
  res.json(await buildInvestorReportPayload());
});

router.get("/report", async (_req: Request, res: Response) => {
  res.json(await buildInvestorReportPayload());
});

// Approval creates a customer offer only. The borrower must accept the terms,
// after which /api/loans/:id/accept starts the real provider disbursement.
router.post("/loans/:id/approve", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const decisionNotes = (req.body?.decisionNotes ?? "").toString().trim();
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application) throw new AppError("Loan application not found", 404);

  if (!["pending", "resubmitted"].includes(application.status)) {
    throw new AppError("Only pending or resubmitted applications can be approved", 400);
  }

  const offered = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: "offered",
      approvedBy: req.user!.userId,
      decidedAt: new Date(),
      decisionNotes: decisionNotes || "Approved subject to customer acceptance",
    },
  });

  await prisma.notification.create({
    data: {
      userId: offered.applicantId,
      title: "Loan Offer Ready",
      body: `Your UGX ${Number(offered.amount).toLocaleString()} loan offer is ready for review and acceptance.`,
      type: "success",
    },
  });

  res.json({ ok: true, application: mapApplication(offered) });
});

router.post("/loans/:id/reject", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const decisionNotes = (req.body?.decisionNotes ?? "").toString().trim();
  if (!decisionNotes) throw new AppError("Decision notes are required to reject", 400);

  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application) throw new AppError("Loan application not found", 404);
  if (!["pending", "resubmitted"].includes(application.status)) {
    throw new AppError("Only pending or resubmitted applications can be rejected", 400);
  }

  const rejected = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: "rejected",
      approvedBy: req.user!.userId,
      decidedAt: new Date(),
      decisionNotes,
    },
  });

  await prisma.notification.create({
    data: {
      userId: rejected.applicantId,
      title: "Loan Rejected",
      body: `Your loan request was rejected: ${decisionNotes}`,
      type: "warning",
    },
  });

  res.json({ ok: true, application: mapApplication(rejected) });
});

router.post("/loans/:id/resubmit", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application) throw new AppError("Loan application not found", 404);
  if (application.status !== "rejected") {
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
