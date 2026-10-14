/**
 * Portfolio quality figures computed from booked loans and their repayment records.
 * A loan is overdue when its due date has passed and an unpaid balance remains;
 * days past due run from the due date. PARn is the outstanding balance of loans more
 * than n days past due, as a share of all outstanding balances.
 */
export interface BookedLoan {
  applicationId: string;
  principal: number;
  interest: number;
  total: number;
  amountPaid: number;
  disbursedAt: Date | null;
  dueDate: Date | null;
  sector?: string | null;
}

export interface ParBucket { days: number; outstanding: number; loans: number; pct: number }

export interface VintageRow {
  vintage: string;
  loans: number;
  principal: number;
  repaid: number;
  repaidPct: number;
  outstanding: number;
  par30Pct: number;
  par90Pct: number;
}

export interface PortfolioSummary {
  bookedLoans: number;
  openLoans: number;
  repaidLoans: number;
  overdueLoans: number;
  outstanding: number;
  overdueOutstanding: number;
  par: ParBucket[];
  /** Loans more than 90 days past due, as a share of loans ever booked. */
  defaultRatePct: number;
  /** Fully repaid loans as a share of loans ever booked. */
  repaymentRatePct: number;
  vintages: VintageRow[];
  sectors: Array<{ sector: string; loans: number; outstanding: number; par30Pct: number }>;
}

const DAY_MS = 86_400_000;
export const PAR_DAYS = [1, 7, 30, 90] as const;

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function outstandingOf(loan: BookedLoan): number {
  return Math.max(0, Math.round(loan.total - loan.amountPaid));
}

export function daysPastDue(loan: BookedLoan, now: Date): number {
  if (!loan.dueDate || outstandingOf(loan) <= 0) return 0;
  const days = Math.floor((now.getTime() - loan.dueDate.getTime()) / DAY_MS);
  return days > 0 ? days : 0;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function summarizePortfolio(loans: BookedLoan[], now = new Date()): PortfolioSummary {
  const outstanding = loans.reduce((sum, loan) => sum + outstandingOf(loan), 0);
  const overdue = loans.filter((loan) => daysPastDue(loan, now) > 0);
  const par = PAR_DAYS.map((days) => {
    const late = loans.filter((loan) => daysPastDue(loan, now) > days);
    const lateOutstanding = late.reduce((sum, loan) => sum + outstandingOf(loan), 0);
    return { days, outstanding: lateOutstanding, loans: late.length, pct: pct(lateOutstanding, outstanding) };
  });

  const byVintage = new Map<string, BookedLoan[]>();
  for (const loan of loans) {
    const key = loan.disbursedAt ? monthKey(loan.disbursedAt) : "undated";
    byVintage.set(key, [...(byVintage.get(key) ?? []), loan]);
  }
  const vintages = [...byVintage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vintage, group]) => {
    const principal = group.reduce((sum, loan) => sum + loan.principal, 0);
    const total = group.reduce((sum, loan) => sum + loan.total, 0);
    const repaid = group.reduce((sum, loan) => sum + Math.min(loan.amountPaid, loan.total), 0);
    const groupOutstanding = group.reduce((sum, loan) => sum + outstandingOf(loan), 0);
    const lateBy = (days: number) => group.filter((loan) => daysPastDue(loan, now) > days).reduce((sum, loan) => sum + outstandingOf(loan), 0);
    return {
      vintage,
      loans: group.length,
      principal,
      repaid,
      repaidPct: pct(repaid, total),
      outstanding: groupOutstanding,
      par30Pct: pct(lateBy(30), groupOutstanding),
      par90Pct: pct(lateBy(90), groupOutstanding),
    };
  });

  const bySector = new Map<string, BookedLoan[]>();
  for (const loan of loans) {
    const key = loan.sector?.trim() || "Not recorded";
    bySector.set(key, [...(bySector.get(key) ?? []), loan]);
  }
  const sectors = [...bySector.entries()].map(([sector, group]) => {
    const groupOutstanding = group.reduce((sum, loan) => sum + outstandingOf(loan), 0);
    const late = group.filter((loan) => daysPastDue(loan, now) > 30).reduce((sum, loan) => sum + outstandingOf(loan), 0);
    return { sector, loans: group.length, outstanding: groupOutstanding, par30Pct: pct(late, groupOutstanding) };
  }).sort((a, b) => b.outstanding - a.outstanding);

  const repaidLoans = loans.filter((loan) => outstandingOf(loan) === 0).length;
  const defaulted = loans.filter((loan) => daysPastDue(loan, now) > 90).length;
  return {
    bookedLoans: loans.length,
    openLoans: loans.length - repaidLoans,
    repaidLoans,
    overdueLoans: overdue.length,
    outstanding,
    overdueOutstanding: overdue.reduce((sum, loan) => sum + outstandingOf(loan), 0),
    par,
    defaultRatePct: pct(defaulted, loans.length),
    repaymentRatePct: pct(repaidLoans, loans.length),
    vintages,
    sectors,
  };
}

export interface InflowWeek { weekStarting: string; expected: number; loans: number }

/**
 * Expected repayments per week for the next `weeks` weeks, from each open loan's due
 * date and unpaid balance. Loans already past due are reported separately (they are
 * not assumed to pay on any particular date), and loans more than 90 days late are
 * excluded from expected inflows altogether.
 */
export function forecastInflows(loans: BookedLoan[], now = new Date(), weeks = 12): { weekly: InflowWeek[]; overdueCollectible: number; excludedOver90: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekly: InflowWeek[] = Array.from({ length: weeks }, (_, index) => ({
    weekStarting: new Date(start.getTime() + index * 7 * DAY_MS).toISOString().slice(0, 10),
    expected: 0,
    loans: 0,
  }));
  let overdueCollectible = 0;
  let excludedOver90 = 0;
  for (const loan of loans) {
    const outstanding = outstandingOf(loan);
    if (outstanding <= 0 || !loan.dueDate) continue;
    const late = daysPastDue(loan, now);
    if (late > 90) { excludedOver90 += outstanding; continue; }
    if (late > 0) { overdueCollectible += outstanding; continue; }
    const index = Math.floor((loan.dueDate.getTime() - start.getTime()) / (7 * DAY_MS));
    if (index < 0 || index >= weeks) continue;
    weekly[index].expected += outstanding;
    weekly[index].loans += 1;
  }
  return { weekly, overdueCollectible, excludedOver90 };
}
