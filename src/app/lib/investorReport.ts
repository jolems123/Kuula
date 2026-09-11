/**
 * Turns a real AdminReport (all metrics computed from Postgres rows) into
 * downloadable PDF / Excel / CSV files. Shared by the admin dashboard and the
 * admin reports screens so the same numbers export everywhere.
 */
import type { AdminReport } from "../api/admin-types";
import { downloadPdf, downloadExcel, downloadCsv, formatUGX } from "./export";

function kpiRows(r: AdminReport): [string, string][] {
  return [
    ["Total customers", r.customers.total.toLocaleString()],
    ["Verified customers", r.customers.verified.toLocaleString()],
    ["New customers (period)", r.customers.newInPeriod.toLocaleString()],
    ["Loan applications (period)", r.loans.applications.toLocaleString()],
    ["Pending loans", r.loans.pending.toLocaleString()],
    ["Active loans", r.loans.active.toLocaleString()],
    ["Paid loans", r.loans.paid.toLocaleString()],
    ["Overdue loans", r.loans.overdue.toLocaleString()],
    ["Rejected loans", r.loans.rejected.toLocaleString()],
    ["Principal approved (period)", formatUGX(r.loans.approvedPrincipal)],
    ["Outstanding balance", formatUGX(r.loans.outstanding)],
    ["Total disbursed (cash out)", formatUGX(r.revenue.totalDisbursed)],
    ["Total collected (cash in)", formatUGX(r.revenue.totalCollected)],
    ["Realized interest revenue", formatUGX(r.revenue.realizedInterest)],
    ["Expected interest revenue", formatUGX(r.revenue.expectedInterest)],
    ["Savings under management", formatUGX(r.savings.total)],
    ["Savings accounts", r.savings.accounts.toLocaleString()],
    ["Savings deposits", formatUGX(r.savings.deposits)],
    ["Savings withdrawals", formatUGX(r.savings.withdrawals)],
    ["Default rate", `${r.ratios.defaultRatePct}%`],
    ["Repayment rate", `${r.ratios.repaymentRatePct}%`],
    ["Portfolio at risk (PAR)", `${r.ratios.parPct}%`],
  ];
}

function monthlyRows(r: AdminReport): (string | number)[][] {
  return r.monthly.map((m) => [m.month, m.disbursed, m.collected, m.newCustomers]);
}

function subtitle(r: AdminReport): string {
  return `${r.period.label} · generated ${new Date(r.generatedAt).toLocaleString("en-GB")}`;
}

export function exportInvestorReportPdf(r: AdminReport): void {
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

export function exportInvestorReportExcel(r: AdminReport): void {
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

export function exportInvestorReportCsv(r: AdminReport): void {
  downloadCsv("kuula-investor-report", ["Metric", "Value"], kpiRows(r));
}

