/**
 * Admin → Reports. One page, useful immediately: defaults to "This month",
 * one-click presets, custom range tucked behind "Custom". Every figure comes
 * from the database; exports reuse the same payload.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { AdminLayout, AdminPageHeader, AdminCard, StatCard, AdminTable } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { ReportPreset } from "../../api/admin-types";
import { exportInvestorReportPdf, exportInvestorReportExcel, exportInvestorReportCsv } from "../../lib/investorReport";
import { useAdminQuery, AsyncState, FilterTabs, ugx, fmtDateTime, Btn, Field, TwoCol, SectionTitle, inputStyle } from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

const PRESETS: Array<{ id: ReportPreset; label: string }> = [
  { id: "today", label: "Today" }, { id: "week", label: "This week" }, { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" }, { id: "year", label: "This year" }, { id: "all", label: "All time" }, { id: "custom", label: "Custom" },
];

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));

export function AdminReportsDashboardScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [preset, setPreset] = useState<ReportPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);

  const params = preset === "custom" ? (applied ? { from: applied.from || undefined, to: applied.to || undefined } : null) : { range: preset };
  const report = useAdminQuery(token && params ? () => api.admin.report(token, params) : null, [token, preset, applied]);

  return (
    <AdminLayout activeScreen="admin-reports" onNavigate={onNavigate} title="Reports">
      <AdminPageHeader title="Reports" subtitle={report.data ? `${report.data.period.label} · generated ${fmtDateTime(report.data.generatedAt)}` : "Portfolio, collections, customers and savings — from the ledger"}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" disabled={!report.data} onClick={() => report.data && exportInvestorReportPdf(report.data)}><Download size={14} /> PDF</Btn>
            <Btn variant="secondary" disabled={!report.data} onClick={() => report.data && exportInvestorReportExcel(report.data)}><Download size={14} /> Excel</Btn>
            <Btn variant="secondary" disabled={!report.data} onClick={() => report.data && exportInvestorReportCsv(report.data)}><Download size={14} /> CSV</Btn>
          </div>
        } />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <FilterTabs value={preset} onChange={setPreset} options={PRESETS} />
        {preset === "custom" && (
          <form onSubmit={(e) => { e.preventDefault(); setApplied({ from, to }); }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            <span style={{ fontSize: 12, color: "#64748B" }}>to</span>
            <input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            <Btn type="submit" disabled={!from && !to}>Apply</Btn>
          </form>
        )}
      </div>

      {preset === "custom" && !applied ? (
        <p style={{ fontSize: 13, color: "#64748B" }}>Pick a start and/or end date, then Apply.</p>
      ) : (
        <AsyncState state={report} emptyTitle="">
          {(r) => (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 14 }}>
                <StatCard label="Applications" value={String(r.loans.applications)} sub={`${r.loans.rejected} rejected · ${r.ratios.approvalRatePct}% approval`} icon={<></>} />
                <StatCard label="Principal approved" value={ugx(r.loans.approvedPrincipal)} sub="Offers made in period" color="#8B5CF6" icon={<></>} />
                <StatCard label="Disbursed" value={ugx(r.revenue.totalDisbursed)} sub={`${r.revenue.disbursementsPending} pending · ${r.revenue.disbursementsFailed} failed`} color="var(--status-error)" icon={<></>} />
                <StatCard label="Collected" value={ugx(r.revenue.totalCollected)} sub={`${r.revenue.collectionsPending} pending · ${r.revenue.collectionsFailed} failed`} color="var(--status-success)" icon={<></>} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
                <StatCard label="New customers" value={String(r.customers.newInPeriod)} sub={`${r.customers.total} active in total`} icon={<></>} />
                <StatCard label="Outstanding portfolio" value={ugx(r.loans.outstanding)} sub="Unpaid principal + interest, now" color="#0EA5E9" icon={<></>} />
                <StatCard label="Portfolio at risk" value={`${r.ratios.parPct}%`} sub={`${r.loans.overdue} overdue in period`} color="var(--status-error)" icon={<></>} />
                <StatCard label="Savings held" value={ugx(r.savings.total)} sub={`${ugx(r.savings.deposits)} in · ${ugx(r.savings.withdrawals)} out`} color="#8B5CF6" icon={<></>} />
              </div>

              <TwoCol>
                <AdminCard>
                  <SectionTitle>Cash flow — last 12 months</SectionTitle>
                  {r.monthly.every((m) => m.disbursed === 0 && m.collected === 0) ? (
                    <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No completed payouts or collections in the last 12 months.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={r.monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => ugx(v)} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="disbursed" name="Disbursed" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="collected" name="Collected" fill="var(--brand-accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </AdminCard>
                <AdminCard>
                  <SectionTitle>Applications — last 7 days</SectionTitle>
                  {r.daily.every((d) => d.applications === 0) ? (
                    <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>No applications in the last 7 days.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={r.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="applications" name="Applications" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="approved" name="Approved" fill="var(--brand-accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </AdminCard>
              </TwoCol>

              <div style={{ marginTop: 16 }}>
                <TwoCol>
                  <AdminCard>
                    <SectionTitle>Loan book — {r.period.label.toLowerCase()}</SectionTitle>
                    <Field label="Applications received" value={r.loans.applications} />
                    <Field label="Awaiting review" value={r.loans.pending} />
                    <Field label="Offers sent" value={r.loans.offered} />
                    <Field label="Disbursing" value={r.loans.disbursing} />
                    <Field label="Active" value={r.loans.active} />
                    <Field label="Overdue" value={r.loans.overdue} />
                    <Field label="Repaid" value={r.loans.paid} />
                    <Field label="Rejected" value={r.loans.rejected} />
                    <Field label="Payout failed" value={r.loans.failed} />
                    <Field label="Interest realised (repaid loans)" value={ugx(r.revenue.realizedInterest)} />
                    <Field label="Interest expected (booked loans)" value={ugx(r.revenue.expectedInterest)} />
                    <Field label="Repayment rate" value={`${r.ratios.repaymentRatePct}%`} />
                    <Field label="Default rate" value={`${r.ratios.defaultRatePct}%`} />
                  </AdminCard>
                  <AdminCard>
                    <SectionTitle>Customers &amp; savings</SectionTitle>
                    <Field label="Active customers" value={r.customers.total} />
                    <Field label="KYC verified" value={r.customers.verified} />
                    <Field label="New in period" value={r.customers.newInPeriod} />
                    <Field label="Deactivated" value={r.customers.deactivated} />
                    <Field label="Savings accounts" value={r.savings.accounts} />
                    <Field label="Savings held (now)" value={ugx(r.savings.total)} />
                    <Field label="Deposits in period" value={ugx(r.savings.deposits)} />
                    <Field label="Withdrawals in period" value={ugx(r.savings.withdrawals)} />
                    <div style={{ height: 12 }} />
                    <SectionTitle>Today</SectionTitle>
                    <AdminTable columns={["Applications", "Approved", "Rejected", "Disbursed", "Collected"]}
                      rows={[[String(r.today.applications), String(r.today.approved), String(r.today.rejected), ugx(r.today.disbursed), ugx(r.today.collected)]]} />
                  </AdminCard>
                </TwoCol>
              </div>
            </>
          )}
        </AsyncState>
      )}
    </AdminLayout>
  );
}
