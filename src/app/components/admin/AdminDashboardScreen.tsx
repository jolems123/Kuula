import { FileText, Users, Wallet, AlertTriangle, ShieldCheck, PiggyBank, LifeBuoy, Activity, ArrowUpRight, Download } from "lucide-react";
import { useState } from "react";
import { AdminLayout, StatCard, AdminTable, StatusBadge, AdminPageHeader, AdminCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { exportInvestorReportPdf } from "../../lib/investorReport";
import { useAdminQuery, AsyncState, ugx, fmtDate, withId, LOAN_STATUS_LABEL, useAction, InlineError, Btn } from "../admin/AdminKit";

interface Props { onNavigate: (s: string) => void; }

export function AdminDashboardScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const stats = useAdminQuery(token ? () => api.admin.stats(token) : null, [token], { pollMs: 30_000 });
  const exporter = useAction();
  const [exported, setExported] = useState(false);

  const generateReport = () =>
    exporter.run(() => api.admin.investorReport(token!), (r) => { exportInvestorReportPdf(r); setExported(true); });

  const v = (n: number | undefined) => (stats.data ? String(n ?? 0) : "…");
  const firstName = state.user?.fullName?.split(" ")[0];

  return (
    <AdminLayout activeScreen="admin-dashboard" onNavigate={onNavigate} title="Dashboard">
      <AdminPageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        subtitle={stats.data ? `Live figures as of ${new Date(stats.data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Loading live figures…"}
        action={
          <Btn variant="secondary" onClick={generateReport} disabled={!token || exporter.busy}>
            <Download size={14} /> {exporter.busy ? "Preparing…" : "Export report (PDF)"}
          </Btn>
        }
      />
      <InlineError message={exporter.error} onDismiss={exporter.clearError} />
      {exported && !exporter.error && <p style={{ fontSize: 11, color: "#64748B", margin: "-6px 0 12px" }}>Report downloaded. All figures are all-time totals from the ledger.</p>}

      <AsyncState state={stats} emptyTitle="">
        {(s) => (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
              <StatCard label="Customers" value={v(s.customers)} sub="Active accounts" color="var(--brand-primary)"
                icon={<Users size={18} color="var(--brand-primary)" />} onClick={() => onNavigate("admin-customer-list")} />
              <StatCard label="Pending applications" value={v(s.pendingApplications)} sub={`${s.offeredLoans} offers awaiting acceptance`} color="#F59E0B"
                icon={<FileText size={18} color="#F59E0B" />} onClick={() => onNavigate("admin-loan-apps")} />
              <StatCard label="Active loans" value={v(s.activeLoans)} sub={`${s.overdueLoans} overdue`} color="var(--status-success)"
                icon={<Activity size={18} color="var(--status-success)" />} onClick={() => onNavigate("admin-active-loans")} />
              <StatCard label="Outstanding portfolio" value={stats.data ? ugx(s.outstandingPortfolio) : "…"} sub="Unpaid principal + interest" color="#0EA5E9"
                icon={<Wallet size={18} color="#0EA5E9" />} onClick={() => onNavigate("admin-active-loans")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
              <StatCard label="Savings held" value={stats.data ? ugx(s.savingsTotal) : "…"} sub={`${s.savingsAccounts} accounts`} color="#8B5CF6"
                icon={<PiggyBank size={18} color="#8B5CF6" />} onClick={() => onNavigate("admin-all-savings")} />
              <StatCard label="KYC awaiting review" value={v(s.pendingKyc)} sub="Submitted, not yet verified" color="#F59E0B"
                icon={<ShieldCheck size={18} color="#F59E0B" />} onClick={() => onNavigate("admin-customer-kyc")} />
              <StatCard label="Transactions needing attention" value={v(s.transactionsAttention.pending + s.transactionsAttention.failedLast7d)}
                sub={`${s.transactionsAttention.pending} pending · ${s.transactionsAttention.failedLast7d} failed (7d)`} color="var(--status-error)"
                icon={<AlertTriangle size={18} color="var(--status-error)" />} onClick={() => onNavigate("admin-all-transactions?status=attention")} />
              <StatCard label="Open support tickets" value={v(s.openTickets)} sub="Open or awaiting customer" color="#0EA5E9"
                icon={<LifeBuoy size={18} color="#0EA5E9" />} onClick={() => onNavigate("admin-tickets")} />
            </div>

            <AdminCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>Recent loan applications</h3>
                <button onClick={() => onNavigate("admin-loan-apps")} style={{ fontSize: 12, color: "var(--brand-primary)", fontWeight: 700, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  View all <ArrowUpRight size={12} />
                </button>
              </div>
              {s.recentApplications.length === 0 ? (
                <p style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13, margin: 0 }}>No loan applications yet</p>
              ) : (
                <AdminTable
                  columns={["Customer", "Amount", "Purpose", "Applied", "Status"]}
                  rows={s.recentApplications.map((a) => [
                    a.applicantName || "—",
                    ugx(a.amount),
                    a.purpose,
                    fmtDate(a.createdAt),
                    <StatusBadge key={a.id} status={a.status} label={LOAN_STATUS_LABEL[a.status]} />,
                  ])}
                  onRowClick={(i) => onNavigate(withId("admin-loan-detail", s.recentApplications[i].id))}
                />
              )}
            </AdminCard>
          </>
        )}
      </AsyncState>
    </AdminLayout>
  );
}
