/**
 * Admin → Reports.
 *
 * Every figure is computed from database rows. Flow figures (applications,
 * disbursed, collected, new customers) respect the selected period; stock
 * figures (outstanding portfolio, savings held, verified customers) are
 * point-in-time and reported as such.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { parseRange, rangeWhere, num, inRange, type DateRange } from "./shared.js";

const router = Router();

const BOOKED = ["offered", "disbursing", "active", "paid", "overdue"];

export async function buildReport(range: DateRange) {
  const txRange = rangeWhere(range) ?? {};
  const [txns, apps, reps, savings, customers] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...txRange },
      select: { type: true, amount: true, status: true, createdAt: true, settledAt: true },
    }),
    prisma.loanApplication.findMany({
      where: { ...txRange },
      select: { amount: true, interest: true, status: true, createdAt: true, decidedAt: true },
    }),
    prisma.repayment.findMany({ select: { total: true, amountPaid: true, status: true, dueDate: true } }),
    prisma.savingsAccount.findMany({ where: { user: { role: "user" } }, select: { balance: true } }),
    prisma.user.findMany({ where: { role: "user" }, select: { verified: true, kycVerified: true, createdAt: true, deletedAt: true } }),
  ]);

  const completed = txns.filter((t) => t.status === "completed");
  const sumTx = (type: string) => completed.filter((t) => t.type === type).reduce((s, t) => s + num(t.amount), 0);
  const countTx = (type: string, status?: string) =>
    txns.filter((t) => t.type === type && (!status || t.status === status)).length;

  const countBy = (s: string) => apps.filter((a) => a.status === s).length;
  const pending = countBy("pending") + countBy("resubmitted");
  const offered = countBy("offered");
  const disbursing = countBy("disbursing");
  const active = countBy("active");
  const paid = countBy("paid");
  const overdue = countBy("overdue");
  const rejected = countBy("rejected");
  const failed = countBy("disbursement_failed") + countBy("failed");

  const bookedApps = apps.filter((a) => BOOKED.includes(a.status));
  const approvedPrincipal = bookedApps.reduce((s, a) => s + num(a.amount), 0);
  const realizedInterest = apps.filter((a) => a.status === "paid").reduce((s, a) => s + num(a.interest), 0);
  const expectedInterest = bookedApps.reduce((s, a) => s + num(a.interest), 0);

  const outstandingReps = reps.filter((r) => r.status !== "paid");
  const outstanding = outstandingReps.reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0);
  const parOutstanding = outstandingReps
    .filter((r) => r.status === "overdue")
    .reduce((s, r) => s + Math.max(num(r.total) - num(r.amountPaid), 0), 0);

  const totalSavings = savings.reduce((s, a) => s + num(a.balance), 0);
  const concluded = active + paid + overdue;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  // Time series: monthly for the last 12 months, daily for the last 7 days.
  // Both are anchored to "now" so the charts are readable regardless of the
  // chosen period; the period totals above are what the filter controls.
  const now = new Date();
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const months: { key: string; month: string; disbursed: number; collected: number; applications: number; newCustomers: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), month: d.toLocaleString("en-US", { month: "short", year: "2-digit" }), disbursed: 0, collected: 0, applications: 0, newCustomers: 0 });
  }
  const monthOf = (d: Date) => months.find((m) => m.key === monthKey(d));

  const days: { key: string; day: string; applications: number; approved: number; disbursed: number; collected: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ key: d.toDateString(), day: d.toLocaleDateString("en-US", { weekday: "short" }), applications: 0, approved: 0, disbursed: 0, collected: 0 });
  }
  const dayOf = (d: Date) => days.find((b) => b.key === d.toDateString());

  // Series need all-time rows, not just the filtered period.
  const [allTx, allApps] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "completed", createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } },
      select: { type: true, amount: true, createdAt: true },
    }),
    prisma.loanApplication.findMany({
      where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } },
      select: { status: true, createdAt: true },
    }),
  ]);
  for (const t of allTx) {
    const m = monthOf(t.createdAt);
    const b = dayOf(t.createdAt);
    if (t.type === "loan_disbursement") { if (m) m.disbursed += num(t.amount); if (b) b.disbursed += num(t.amount); }
    else if (t.type === "loan_payment") { if (m) m.collected += num(t.amount); if (b) b.collected += num(t.amount); }
  }
  for (const a of allApps) {
    const m = monthOf(a.createdAt);
    if (m) m.applications += 1;
    const b = dayOf(a.createdAt);
    if (b) { b.applications += 1; if (BOOKED.includes(a.status)) b.approved += 1; }
  }
  for (const c of customers) {
    const m = monthOf(c.createdAt);
    if (m) m.newCustomers += 1;
  }

  const todayKey = now.toDateString();
  const appsToday = allApps.filter((a) => a.createdAt.toDateString() === todayKey);
  const txToday = allTx.filter((t) => t.createdAt.toDateString() === todayKey);

  return {
    generatedAt: now.toISOString(),
    period: { preset: range.preset, from: range.from, to: range.to, label: range.label },
    customers: {
      total: customers.filter((c) => !c.deletedAt).length,
      verified: customers.filter((c) => c.kycVerified).length,
      newInPeriod: customers.filter((c) => inRange(c.createdAt, range)).length,
      deactivated: customers.filter((c) => !!c.deletedAt).length,
    },
    loans: {
      applications: apps.length,
      pending, offered, disbursing, active, paid, overdue, rejected, failed,
      approvedPrincipal,
      outstanding,
    },
    revenue: {
      totalDisbursed: sumTx("loan_disbursement"),
      totalCollected: sumTx("loan_payment"),
      realizedInterest,
      expectedInterest,
      disbursementsPending: countTx("loan_disbursement", "pending"),
      disbursementsFailed: countTx("loan_disbursement", "failed"),
      collectionsPending: countTx("loan_payment", "pending"),
      collectionsFailed: countTx("loan_payment", "failed"),
    },
    savings: {
      total: totalSavings,
      accounts: savings.length,
      deposits: sumTx("savings_deposit"),
      withdrawals: sumTx("savings_withdrawal"),
    },
    ratios: {
      defaultRatePct: pct(overdue, concluded),
      repaymentRatePct: pct(paid, concluded),
      parPct: pct(parOutstanding, outstanding),
      approvalRatePct: pct(bookedApps.length, bookedApps.length + rejected),
    },
    monthly: months.map(({ key: _k, ...m }) => m),
    daily: days.map(({ key: _k, ...d }) => d),
    today: {
      applications: appsToday.length,
      approved: appsToday.filter((a) => BOOKED.includes(a.status)).length,
      rejected: appsToday.filter((a) => a.status === "rejected").length,
      disbursed: txToday.filter((t) => t.type === "loan_disbursement").reduce((s, t) => s + num(t.amount), 0),
      collected: txToday.filter((t) => t.type === "loan_payment").reduce((s, t) => s + num(t.amount), 0),
    },
  };
}

// GET /api/admin/report?range=today|week|month|quarter|year|all  (or from/to)
router.get("/report", async (req: Request, res: Response) => {
  res.json(await buildReport(parseRange(req, "month")));
});

// GET /api/admin/investor-report — all-time snapshot used for the PDF export.
router.get("/investor-report", async (req: Request, res: Response) => {
  res.json(await buildReport(parseRange(req, "all")));
});

export default router;
