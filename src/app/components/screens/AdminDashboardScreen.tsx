import { Users, FileClock, AlertTriangle, Building2, FileBarChart, ChevronRight, ShieldCheck, Settings2, Landmark, ScrollText, UserCog, Activity, type LucideIcon } from "lucide-react";
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
  const [loadError, setLoadError] = useState(false);
  const isSuperAdmin = state.role === "super_admin";

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getAdminStats(token)
      .then((s) => { setStats(s); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const firstName = state.user?.fullName?.split(/\s+/)[0];
  const chartData = stats.monthlyChart.length > 0 ? stats.monthlyChart : [{ month: "—", loans: 0, amount: 0 }];
  const today = new Date().toLocaleDateString("en-UG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const count = (n: number) => (loading ? "…" : loadError ? "Unavailable" : n.toLocaleString("en-UG"));
  const sections = [
    { title: "Staff & permissions", detail: "Manage role assignments and staff access", icon: UserCog, route: "admin-staff" },
    { title: "Credit operations", detail: "Review application queues and workflows", icon: ShieldCheck, route: "admin-officer-dashboard" },
    { title: "Portfolio & risk", detail: "Overdue facilities and credit exceptions", icon: AlertTriangle, route: "admin-overdue-loans" },
    { title: "Finance oversight", detail: "Review financial reconciliation exceptions", icon: Landmark, route: "admin-reconciliation" },
    { title: "Compliance & KYC", detail: "Verify customer identity review queues", icon: ScrollText, route: "admin-customer-kyc" },
    { title: "Reports & monitoring", detail: "Access authorized operational reports", icon: Activity, route: "admin-reports" },
    { title: "Support oversight", detail: "Review customer support requests", icon: Users, route: "admin-support-inbox" },
    { title: "System settings", detail: "Administration and configuration", icon: Settings2, route: "admin-settings" },
  ];

  return (
    <AdminLayout activeScreen="admin-dashboard" onNavigate={onNavigate} title={isSuperAdmin ? "Super Admin Control Centre" : "Dashboard"}>
      <AdminPageHeader
        title={isSuperAdmin ? "Super Admin Control Centre" : `${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={today}
        action={
          <>
            <button type="button" className="kx-btn kx-btn--secondary" onClick={() => onNavigate("admin-loan-apps")}><Building2 size={16} strokeWidth={1.75} /> Business reviews</button>
            <button type="button" className="kx-btn kx-btn--primary" onClick={() => onNavigate("admin-reports")}><FileBarChart size={16} strokeWidth={1.75} /> Reports</button>
          </>
        }
      />

      {loadError && <div className="kx-alert kx-alert--error" role="alert">Operational statistics are currently unavailable. Try again later; no placeholder values are presented as live data.</div>}
      {isSuperAdmin && (
        <section className="kx-panel" aria-label="Super administrator operational control centre" style={{marginBottom:20}}>
          <div className="kx-panel__head"><div><h3>Operations & controls</h3><p>Organization-wide oversight. Credit approval and payment authorizations remain independent.</p></div></div>
          <div className="kuula-super-admin-grid">
            {sections.map(({title,detail,icon:Icon,route}) => (
              <button type="button" className="kuula-super-admin-module" key={route} onClick={() => onNavigate(route)}>
                <Icon size={22} aria-hidden="true" strokeWidth={1.7}/>
                <span><strong>{title}</strong><small>{detail}</small></span>
                <ChevronRight size={18} aria-hidden="true"/>
              </button>
            ))}
          </div>
        </section>
      )}
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
