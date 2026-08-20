import { ArrowLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: "#7C5B14", bg: "#FFF9E5", label: "Under review" },
  resubmitted: { color: "#7C5B14", bg: "#FFF9E5", label: "Resubmitted" },
  offered:     { color: "#064A2E", bg: "#EEF7F2", label: "Offer available" },
  disbursing:  { color: "#1E40AF", bg: "#EFF6FF", label: "Settlement pending" },
  approved:    { color: "#064A2E", bg: "#EEF7F2", label: "Approved" },
  active:      { color: "#064A2E", bg: "#EEF7F2", label: "Active" },
  overdue:     { color: "#991B1B", bg: "#FEF2F2", label: "Overdue" },
  paid:        { color: "#425149", bg: "#F3F5F4", label: "Paid" },
  rejected:    { color: "#991B1B", bg: "#FEF2F2", label: "Not approved" },
  failed:      { color: "#991B1B", bg: "#FEF2F2", label: "Failed" },
};

type FilterType = "all" | "active" | "completed" | "rejected";
const FUNDED_STATUSES = new Set(["approved", "active", "overdue", "paid"]);

export function LoanHistoryScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [filter, setFilter] = useState<FilterType>("all");
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let active = true;
    setError("");
    api.getApplications(token)
      .then(({ applications }) => { if (active) setLoans(applications); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load credit history."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const filtered = loans.filter((loan) => {
    if (filter === "all") return true;
    if (filter === "active") return ["active", "overdue", "disbursing", "offered"].includes(loan.status);
    if (filter === "completed") return loan.status === "paid";
    return ["rejected", "failed"].includes(loan.status);
  });

  const funded = loans.filter((loan) => FUNDED_STATUSES.has(loan.status));
  const activeCount = loans.filter((loan) => ["active", "overdue"].includes(loan.status)).length;
  const completedCount = loans.filter((loan) => loan.status === "paid").length;
  const totalBorrowed = funded.reduce((sum, loan) => sum + loan.amount, 0);

  const formatTotal = (n: number) => {
    if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}K`;
    return ugx(n);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#0B5E3A" }}>
        <button aria-label="Back home" onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Credit History</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "14px 12px", background: "white", borderBottom: "1px solid #E8EEEA" }}>
        {[
          { label: "Applications", value: loading ? "—" : String(loans.length) },
          { label: "Active", value: loading ? "—" : String(activeCount) },
          { label: "Paid", value: loading ? "—" : String(completedCount) },
          { label: "Funded", value: loading ? "—" : formatTotal(totalBorrowed) },
        ].map((item) => <div key={item.label} style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1F2937" }}>{item.value}</div><div style={{ fontSize: 9, color: "#87968E", marginTop: 2 }}>{item.label}</div></div>)}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "white", overflowX: "auto", borderBottom: "1px solid #E8EEEA" }}>
        {(["all", "active", "completed", "rejected"] as FilterType[]).map((item) => (
          <button key={item} onClick={() => setFilter(item)} style={{ padding: "7px 13px", borderRadius: 20, border: filter === item ? "1px solid #0B5E3A" : "1px solid #E1E7E3", background: filter === item ? "#EDF8F2" : "#F8FAF9", color: filter === item ? "#0B5E3A" : "#68766F", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{item === "all" ? "All" : item === "active" ? "Open / Active" : item === "completed" ? "Paid" : "Not approved"}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 84px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <p style={{ textAlign: "center", padding: 32, color: "#87968E" }}>Loading your credit history…</p>}
        {error && <p role="alert" style={{ textAlign: "center", padding: 24, color: "#B42318" }}>{error}</p>}

        {!loading && !error && filtered.map((loan) => {
          const style = STATUS_STYLE[loan.status] ?? { color: "#425149", bg: "#F3F5F4", label: loan.status.replace(/_/g, " ") };
          const canOpenLiveDetail = ["active", "overdue"].includes(loan.status);
          const canOpenOffer = ["pending", "resubmitted", "offered", "disbursing", "rejected", "failed"].includes(loan.status);
          const action = canOpenLiveDetail ? () => onNavigate("loan-detail") : canOpenOffer ? () => onNavigate("loan-approval") : undefined;
          const Wrapper = action ? "button" : "div";
          return (
            <Wrapper key={loan.id} {...(action ? { onClick: action } : {})} style={{ background: "white", borderRadius: 16, padding: "14px 16px", border: "1px solid #E8EEEA", boxShadow: "0 2px 6px rgba(0,0,0,0.035)", textAlign: "left", width: "100%", cursor: action ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#1F2937", margin: 0 }}>{ugx(loan.amount)}</p>
                  <p style={{ fontSize: 11, color: "#87968E", margin: "3px 0 0" }}>{loan.purpose} · {loan.termDays} days · {fmtDate(loan.createdAt)}</p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, fontWeight: 800, color: style.color, background: style.bg, padding: "4px 9px", borderRadius: 20 }}>{style.label}</span>{action && <ChevronRight size={14} color="#A6B1AB" />}</div>
              </div>
              <div style={{ marginTop: 10, borderTop: "1px solid #F0F3F1", paddingTop: 9, display: "grid", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}><span style={{ color: "#87968E" }}>Application</span><span style={{ color: "#425149", fontWeight: 600 }}>{loan.id.slice(0, 12)}…</span></div>
                {loan.total > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}><span style={{ color: "#87968E" }}>Quoted total repayment</span><span style={{ color: "#425149", fontWeight: 700 }}>{ugx(loan.total)}</span></div>}
                {loan.offerExpiresAt && loan.status === "offered" && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}><span style={{ color: "#87968E" }}>Offer expires</span><span style={{ color: "#425149", fontWeight: 600 }}>{fmtDate(loan.offerExpiresAt)}</span></div>}
              </div>
              {loan.status === "paid" && <div style={{ marginTop: 9, display: "flex", gap: 5, alignItems: "center", color: "#0B5E3A", fontSize: 11, fontWeight: 700 }}><TrendingUp size={12} /> Fully repaid</div>}
            </Wrapper>
          );
        })}

        {!loading && !error && filtered.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "#87968E" }}><p style={{ fontSize: 15, margin: 0 }}>No records in this category</p></div>}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
