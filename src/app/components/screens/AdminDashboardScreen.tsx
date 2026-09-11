import { FileText, Users, DollarSign, AlertTriangle, TrendingUp, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import { AdminLayout, StatCard, AdminTable, StatusBadge, AdminPageHeader } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import type { AdminStats } from "../../api/types-compat";
import { exportInvestorReportPdf } from "../../lib/investorReport";

interface Props { onNavigate: (s: string) => void; }

const EMPTY_STATS: AdminStats = {
  totalCustomers: 0,
  pendingApprovals: 0,
  overdueLoans: 0,
  recentApplications: [],
  monthlyChart: [],
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminDashboardScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    if (!token || generating) return;
    setGenerating(true);
    try {
      const report = await api.getInvestorReport(token);
      exportInvestorReportPdf(report);
    } catch {
      // No fake fallback — leave the button ready to retry.
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getAdminStats(token)
      .then((s) => setStats(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const chartData = stats.monthlyChart.length > 0
    ? stats.monthlyChart
    : [{ month: "—", loans: 0, amount: 0 }];

  return (
    <AdminLayout activeScreen="admin-dashboard" onNavigate={onNavigate} title="Dashboard Overview">
      <AdminPageHeader
        title="Good morning, Admin 👋"
        subtitle="Here's what's happening with Kuula today."
        action={
          <button onClick={generateReport} disabled={generating} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--brand-primary)", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: generating ? "default" : "pointer", opacity: generating ? 0.7 : 1 }}>
            {generating ? "Generating…" : "Generate Report"}
          </button>
        }
      />

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <StatCard label="Registered Customers" value={loading ? "…" : stats.totalCustomers.toLocaleString()} sub="Total users" color="var(--brand-primary)"
          icon={<Users size={18} color="var(--brand-primary)" />} />
        <StatCard label="Pending Approvals" value={loading ? "…" : String(stats.pendingApprovals)} sub="Awaiting review" color="#F59E0B"
          icon={<FileText size={18} color="#F59E0B" />} />
        <StatCard label="Overdue Loans" value={loading ? "…" : String(stats.overdueLoans)} sub="Require follow-up" color="#EF4444"
          icon={<AlertTriangle size={18} color="#EF4444" />} />
        <StatCard label="Active Backend" value="Node API" sub="Live data" color="#12B984"
          icon={<DollarSign size={18} color="#12B984" />} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>Loan Activity</h3>
              <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>Applications per month (last 6 months)</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#12B984", fontSize: 12, fontWeight: 700 }}>
              <TrendingUp size={14} /> Live
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              <Bar dataKey="loans" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>Quick Stats</h3>
          {[
            { label: "Total Customers", value: loading ? "…" : stats.totalCustomers.toLocaleString(), change: "From user profiles", color: "var(--brand-primary)" },
            { label: "Pending Applications", value: loading ? "…" : String(stats.pendingApprovals), change: "Awaiting admin decision", color: "#F59E0B" },
            { label: "Overdue Loans", value: loading ? "…" : String(stats.overdueLoans), change: "Past due date", color: "#EF4444" },
            { label: "Recent Applications", value: loading ? "…" : String(stats.recentApplications.length), change: "Last 5 submissions", color: "#8B5CF6" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F8FAFC" }}>
              <span style={{ fontSize: 13, color: "#64748B" }}>{s.label}</span>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "#94A3B8", margin: 0 }}>{s.change}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>Recent Loan Applications</h3>
          <button onClick={() => onNavigate("admin-loan-apps")} style={{ fontSize: 12, color: "var(--brand-primary)", fontWeight: 700, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            View All <ArrowUpRight size={12} />
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF", fontSize: 13 }}>Loading applications…</div>
        ) : stats.recentApplications.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF", fontSize: 13 }}>No applications yet</div>
        ) : (
          <AdminTable
            columns={["Customer", "Amount", "Purpose", "Date Applied", "Status"]}
            rows={stats.recentApplications.map((a: LoanApplication) => [
              a.applicantName,
              `UGX ${Number(a.amount).toLocaleString()}`,
              a.purpose,
              fmtDate(a.createdAt),
              <StatusBadge key={a.id} status={a.status} />,
            ])}
            onRowClick={() => onNavigate("admin-loan-app-detail")}
          />
        )}
      </div>
    </AdminLayout>
  );
}
