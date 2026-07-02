import { FileText, Users, DollarSign, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useEffect } from "react";
import { AdminLayout, AdminPageHeader, AdminCard } from "../AdminLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { InvestorReport } from "../../api/supabase-service";
import { formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

export function AdminQuickStatsScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [report, setReport] = useState<InvestorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true);
    setError(null);
    api.getInvestorReport(token)
      .then((r) => { if (active) setReport(r); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load stats"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const stats = report ? [
    { label: "Total Customers", value: report.customers.total.toLocaleString(), color: "#0D5C3A", Icon: Users },
    { label: "Active Loans", value: report.loans.active.toLocaleString(), color: "#10B981", Icon: FileText },
    { label: "Total Disbursed", value: formatUGX(report.revenue.totalDisbursed), color: "#8B5CF6", Icon: DollarSign },
    { label: "Total Collected", value: formatUGX(report.revenue.totalCollected), color: "#10B981", Icon: TrendingUp },
    { label: "Outstanding", value: formatUGX(report.loans.outstanding), color: "#F59E0B", Icon: AlertTriangle },
    { label: "Default Rate", value: `${report.ratios.defaultRatePct}%`, color: "#EF4444", Icon: TrendingDown },
  ] : [];

  return (
    <AdminLayout activeScreen="admin-quick-stats" onNavigate={onNavigate} title="Quick Stats">
      <AdminPageHeader title="Quick Stats" subtitle="Live metrics computed from real Kuula data" />

      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>Loading stats…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#EF4444", fontSize: 13 }}>{error}</div>
      ) : !report ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>No data available</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {stats.map((s) => {
              const Icon = s.Icon;
              return (
                <AdminCard key={s.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={18} color={s.color} />
                    </div>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 900, color: "#0F172A", margin: "0 0 4px", letterSpacing: -0.5 }}>{s.value}</p>
                  <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>{s.label}</p>
                </AdminCard>
              );
            })}
          </div>

          <AdminCard>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>Disbursed vs Collected (last 12 months · UGX)</h3>
            {report.monthly.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No monthly activity yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={report.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`} />
                  <Tooltip formatter={(v: number) => formatUGX(Number(v))} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Legend />
                  <Line key="disbursed" type="monotone" dataKey="disbursed" stroke="#0D5C3A" strokeWidth={2.5} dot={{ fill: "#0D5C3A", r: 3 }} name="Disbursed" />
                  <Line key="collected" type="monotone" dataKey="collected" stroke="#10B981" strokeWidth={2.5} dot={{ fill: "#10B981", r: 3 }} name="Collected" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </AdminCard>
        </>
      )}
    </AdminLayout>
  );
}
