import { Users, FileClock, AlertTriangle, Building2, FileBarChart, ChevronRight, type LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { AdminLayout, StatusBadge, AdminPageHeader } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import type { AdminStats } from "../../api/types-compat";

interface Props { onNavigate: (s: string) => void; }

const EMPTY_STATS: AdminStats = {
  totalCustomers: 0,
  pendingApprovals: 0,
  overdueLoans: 0,
  recentApplications: [],
  monthlyChart: [],
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

interface KpiProps { label: string; value: string; sub: string; icon: LucideIcon; tone?: "warn" | "bad"; onClick: () => void; }

function Kpi({ label, value, sub, icon: Icon, tone, onClick }: KpiProps) {
  return (
    <button type="button" className={`kx-stat kx-stat--link${tone ? ` kx-stat--${tone}` : ""}`} onClick={onClick}>
      <div className="kx-stat__head">
        <span className="kx-stat__label">{label}</span>
        <span className="kx-stat__icon"><Icon strokeWidth={1.75} /></span>
      </div>
      <div className="kx-stat__value">{value}</div>
      <div className="kx-stat__sub">{sub}</div>
    </button>
  );
}

export function AdminDashboardScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getAdminStats(token)
      .then((s) => setStats(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const firstName = state.user?.fullName?.split(/\s+/)[0];
  const chartData = stats.monthlyChart.length > 0 ? stats.monthlyChart : [{ month: "—", loans: 0, amount: 0 }];
  const today = new Date().toLocaleDateString("en-UG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const count = (n: number) => (loading ? "…" : n.toLocaleString("en-UG"));

  return (
    <AdminLayout activeScreen="admin-dashboard" onNavigate={onNavigate} title="Dashboard">
      <AdminPageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={today}
        action={
          <>
            <button type="button" className="kx-btn kx-btn--secondary" onClick={() => onNavigate("admin-partner-financing")}><Building2 size={16} strokeWidth={1.75} /> Partner verification</button>
            <button type="button" className="kx-btn kx-btn--primary" onClick={() => onNavigate("admin-reports")}><FileBarChart size={16} strokeWidth={1.75} /> Reports</button>
          </>
        }
      />

      <div className="kx-kpis">
        <Kpi label="Customers" value={count(stats.totalCustomers)} sub="Registered accounts" icon={Users} onClick={() => onNavigate("admin-customer-list")} />
        <Kpi label="Awaiting review" value={count(stats.pendingApprovals)} sub="Applications to decide" icon={FileClock} tone="warn" onClick={() => onNavigate("admin-loan-apps")} />
        <Kpi label="Overdue facilities" value={count(stats.overdueLoans)} sub="Need follow-up" icon={AlertTriangle} tone="bad" onClick={() => onNavigate("admin-overdue-loans")} />
      </div>

      <div className="kx-dash-grid">
        <section className="kx-panel">
          <div className="kx-panel__head">
            <div>
              <h3>Applications per month</h3>
              <p>Last 6 months</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="#eef3f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#8c9892" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#8c9892" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(11, 94, 58, .06)" }} contentStyle={{ borderRadius: 10, border: "1px solid #e3ebe6", boxShadow: "0 8px 24px -12px rgba(4,53,31,.3)", fontSize: 13 }} />
              <Bar dataKey="loans" name="Applications" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {chartData.map((_, i) => <Cell key={i} fill={i === chartData.length - 1 ? "#0b5e3a" : "#bfe0cd"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="kx-panel kx-panel--flush">
          <div className="kx-panel__head">
            <div>
              <h3>Recent applications</h3>
              <p>Latest submissions</p>
            </div>
            <button type="button" className="kx-link" onClick={() => onNavigate("admin-loan-apps")}>View all</button>
          </div>
          {loading ? (
            <div className="kx-empty">Loading applications…</div>
          ) : stats.recentApplications.length === 0 ? (
            <div className="kx-empty">No applications yet</div>
          ) : (
            <ul className="kx-list">
              {stats.recentApplications.slice(0, 5).map((a: LoanApplication) => (
                <li key={a.id}>
                  <button type="button" className="kx-list__item kx-list__item--button" onClick={() => onNavigate("admin-loan-apps")}>
                    <span className="kx-avatar kx-avatar--soft">{a.applicantName?.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "—"}</span>
                    <span className="kx-list__text">
                      <strong>{a.applicantName}</strong>
                      <span>UGX {Number(a.amount).toLocaleString("en-UG")} · {fmtDate(a.createdAt)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                    <ChevronRight size={16} strokeWidth={1.75} className="kx-row__chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
