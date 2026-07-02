import { ArrowLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#F59E0B", bg: "#FFF7ED" },
  approved: { color: "#10B981", bg: "#F0FDF4" },
  active:   { color: "#10B981", bg: "#F0FDF4" },
  completed:{ color: "#0D5C3A", bg: "#ECF5F0" },
  paid:     { color: "#0D5C3A", bg: "#ECF5F0" },
  rejected: { color: "#EF4444", bg: "#FEF2F2" },
  overdue:  { color: "#EF4444", bg: "#FEF2F2" },
};

type FilterType = "all" | "active" | "approved" | "completed" | "rejected";

const FILTER_STATUSES: Record<FilterType, string[]> = {
  all:       [],
  active:    ["active", "approved"],
  approved:  ["approved", "active"],
  completed: ["paid"],
  rejected:  ["rejected"],
};

export function LoanHistoryScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const [filter, setFilter] = useState<FilterType>("all");
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setLoans(applications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = filter === "all"
    ? loans
    : loans.filter((l) => FILTER_STATUSES[filter].includes(l.status));

  const totalLoans = loans.length;
  const activeCount = loans.filter((l) => ["active", "approved"].includes(l.status)).length;
  const completedCount = loans.filter((l) => ["paid"].includes(l.status)).length;
  const totalBorrowed = loans
    .filter((l) => l.status !== "rejected")
    .reduce((s, l) => s + l.amount, 0);

  const formatTotal = (n: number) => {
    if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}K`;
    return ugx(n);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}>
        <button onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>{t("loanHistory.title")}</span>
      </div>

      <div style={{ display: "flex", gap: 10, padding: "14px 16px 0", background: "white", borderBottom: "1px solid #F3F4F6" }}>
        {[
          { label: t("loanHistory.totalLoans"), value: loading ? "—" : String(totalLoans) },
          { label: t("loanHistory.completed"), value: loading ? "—" : String(completedCount) },
          { label: t("loanHistory.active"), value: loading ? "—" : String(activeCount) },
          { label: t("loanHistory.totalBorrowed"), value: loading ? "—" : formatTotal(totalBorrowed) },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, textAlign: "center", paddingBottom: 12 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#1F2937", margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "white", overflowX: "auto", scrollbarWidth: "none", borderBottom: "1px solid #F3F4F6" }}>
        {(["all", "active", "completed", "rejected"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              background: filter === f ? "#0D5C3A" : "#F3F4F6",
              color: filter === f ? "white" : "#6B7280",
            }}
          >
            {t(`loanHistory.filter.${f}`)}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 80px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 14 }}>Loading loans…</p>
          </div>
        )}
        {!loading && filtered.map((loan) => {
          const statusKey = loan.status;
          const s = STATUS_STYLE[statusKey] ?? STATUS_STYLE.rejected;
          const isPaidOrActive = ["paid", "active", "approved"].includes(loan.status);
          const appliedDate = new Date(loan.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

          return (
            <button
              key={loan.id}
              onClick={() => onNavigate("loan-detail")}
              style={{ background: "white", borderRadius: 16, padding: "14px 16px", border: "1px solid #F3F4F6", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left", width: "100%" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#1F2937", margin: 0 }}>{ugx(loan.amount)}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                    {loan.id.slice(0, 12)} · {loan.purpose} · {appliedDate}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 10px", borderRadius: 20, textTransform: "capitalize" }}>
                    {t(`loanHistory.status.${statusKey}`, { defaultValue: statusKey })}
                  </span>
                  <ChevronRight size={14} color="#D1D5DB" />
                </div>
              </div>
              {["active", "approved"].includes(loan.status) && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{t("loanHistory.due")} {loan.decidedAt ? new Date(new Date(loan.decidedAt).getTime() + loan.termDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>{t("loanHistory.percentPaid", { pct: 0 })}</span>
                  </div>
                  <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3 }}>
                    <div style={{ width: "0%", height: "100%", background: "#10B981", borderRadius: 3 }} />
                  </div>
                </div>
              )}
              {isPaidOrActive && loan.status === "paid" && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <TrendingUp size={12} color="#10B981" />
                  <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>{t("loanHistory.fullyRepaid")}</span>
                </div>
              )}
            </button>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 16 }}>No loans yet</p>
            <p style={{ fontSize: 13 }}>Your loan history will appear here once you apply.</p>
          </div>
        )}
      </div>

      <BottomNav active="loans" onNavigate={onNavigate} />
    </div>
  );
}
