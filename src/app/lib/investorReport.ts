/**
 * Turns a real InvestorReport (all metrics computed from Postgres rows) into
 * downloadable PDF / Excel / CSV files. Shared by the admin dashboard and the
 * admin reports screens so the same numbers export everywhere.
 */
import type { InvestorReport } from "../api/types-compat";
import { downloadPdf, downloadExcel, downloadCsv, formatUGX } from "./export";

function kpiRows(r: InvestorReport): [string, string][] {
  return [
    ["Total customers", r.customers.total.toLocaleString()],
    ["Verified customers", r.customers.verified.toLocaleString()],
    ["New customers this month", r.customers.newThisMonth.toLocaleString()],
    ["Total loans", r.loans.total.toLocaleString()],
    ["Pending loans", r.loans.pending.toLocaleString()],
    ["Active loans", r.loans.active.toLocaleString()],
    ["Paid loans", r.loans.paid.toLocaleString()],
    ["Overdue loans", r.loans.overdue.toLocaleString()],
    ["Rejected loans", r.loans.rejected.toLocaleString()],
    ["Principal disbursed", formatUGX(r.loans.disbursedPrincipal)],
    ["Outstanding balance", formatUGX(r.loans.outstanding)],
    ["Total disbursed (cash out)", formatUGX(r.revenue.totalDisbursed)],
    ["Total collected (cash in)", formatUGX(r.revenue.totalCollected)],
    ["Realized interest revenue", formatUGX(r.revenue.realizedInterest)],
    ["Expected interest revenue", formatUGX(r.revenue.expectedInterest)],
    ["Default rate", `${r.ratios.defaultRatePct}%`],
    ["Repayment rate", `${r.ratios.repaymentRatePct}%`],
    ["Portfolio at risk (PAR)", `${r.ratios.parPct}%`],
  ];
}

function monthlyRows(r: InvestorReport): (string | number)[][] {
  return r.monthly.map((m) => [m.month, m.disbursed, m.collected, m.newCustomers]);
}

function subtitle(r: InvestorReport): string {
  return `Investor report · generated ${new Date(r.generatedAt).toLocaleString("en-GB")}`;
}

export function exportInvestorReportPdf(r: InvestorReport): void {
  downloadPdf({
    title: "Investor Report",
    subtitle: subtitle(r),
    tables: [
      {
        title: "Key Performance Indicators",
        head: ["Metric", "Value"],
        rows: kpiRows(r),
      },
      {
        title: "Monthly Activity (last 12 months)",
        head: ["Month", "Disbursed (UGX)", "Collected (UGX)", "New Customers"],
        rows: monthlyRows(r),
      },
    ],
  });
}

export function exportInvestorReportExcel(r: InvestorReport): void {
  downloadExcel("kuula-investor-report", [
    { name: "KPIs", rows: [["Metric", "Value"], ...kpiRows(r)] },
    {
      name: "Monthly",
      rows: [
        ["Month", "Disbursed (UGX)", "Collected (UGX)", "New Customers"],
        ...monthlyRows(r),
      ],
    },
  ]);
}

export function exportInvestorReportCsv(r: InvestorReport): void {
  downloadCsv("kuula-investor-report", ["Metric", "Value"], kpiRows(r));
}
