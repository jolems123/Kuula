import { UiText, uiText, uiLocale } from "../../../i18n/ui-text";
import { ArrowLeft, ChevronRight, TrendingUp, Check, Circle, Clock3, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { BottomNav } from "../BottomNav";
import { GuarantorNomination } from "../GuarantorNomination";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { setSelectedLoanApplicationId } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(uiLocale(), { day: "numeric", month: "short", year: "numeric" });
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
  expired:     { color: "#6B7280", bg: "#F3F4F6", label: "Offer expired" },
  cancelled:   { color: "#6B7280", bg: "#F3F4F6", label: "Payout cancelled" },
};

type FilterType = "all" | "offers" | "active" | "completed" | "rejected";
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
    if (filter === "offers") return loan.status === "offered";
    if (filter === "active") return ["active", "overdue", "disbursing", "offered"].includes(loan.status);
    if (filter === "completed") return loan.status === "paid";
    return ["rejected", "failed", "expired", "cancelled"].includes(loan.status);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#F5F8F6", color: "#183128" }}>

      <header style={{ background: "white", borderBottom: "1px solid #DEE8E2", padding: "clamp(18px, 2.6vw, 32px) clamp(16px, 3vw, 40px) 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <button type="button" aria-label={uiText("Back home")} onClick={() => onNavigate("home")} style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, background: "#E9F4ED", border: "none", display: "grid", placeItems: "center", cursor: "pointer" }}><ArrowLeft size={22} color="#0B5E3A" /></button>
          <div>
            <h1 style={{ fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 800, letterSpacing: "-0.035em", color: "#143B2B", margin: 0 }}>Credit history</h1>
            <p style={{ color: "#667D70", fontSize: 15, margin: "4px 0 0" }}>Your applications, agreements and repayment progress in one place</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 24 }}>
          {[
            { label: "Applications", value: loading ? "—" : String(loans.length) },
            { label: "Active loans", value: loading ? "—" : String(activeCount) },
            { label: "Fully repaid", value: loading ? "—" : String(completedCount) },
            { label: "Total funded", value: loading ? "—" : formatTotal(totalBorrowed) },
          ].map(item => <div key={item.label} style={{ padding: "16px 18px", background: "#F6FAF7", borderRadius: 14 }}>
            <div style={{ fontSize: 14, color: "#60776A", fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: "clamp(22px, 2.2vw, 28px)", fontWeight: 800, color: "#123E2B", marginTop: 6 }}>{item.value}</div>
          </div>)}
        </div>
        <nav aria-label="Filter credit history" style={{ display: "flex", gap: 9, marginTop: 22, flexWrap: "wrap" }}>
          {(["all", "offers", "active", "completed", "rejected"] as FilterType[]).map(item => (
            <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}
              style={{ padding: "11px 17px", minHeight: 44, borderRadius: 10, border: filter === item ? "1px solid #0B5E3A" : "1px solid #DFE9E2", background: filter === item ? "#0B5E3A" : "#FFFFFF", color: filter === item ? "#FFFFFF" : "#435A4C", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {item === "all" ? "All" : item === "offers" ? "Offers to review" : item === "active" ? "Open / Active" : item === "completed" ? "Paid" : "Not approved"}
            </button>
          ))}
        </nav>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "clamp(18px, 3vw, 36px) clamp(16px, 3vw, 40px) 96px", display: "flex", flexDirection: "column", gap: 20 }}>
        {loading && <p style={{ textAlign: "center", padding: 32, color: "#87968E" }}><UiText text={"Loading your credit history…"} /></p>}
        {error && <p role="alert" style={{ textAlign: "center", padding: 24, color: "#B42318" }}><UiText text={error} /></p>}

        {!loading && !error && filtered.map((loan) => {
          const style = STATUS_STYLE[loan.status] ?? { color: "#425149", bg: "#F3F5F4", label: loan.status.replace(/_/g, " ") };
          const canOpenLiveDetail = ["active", "overdue"].includes(loan.status);
          const canOpenOffer = ["pending", "resubmitted", "offered", "disbursing", "rejected", "failed"].includes(loan.status);
          const action = canOpenLiveDetail ? () => { setSelectedLoanApplicationId(loan.id); onNavigate("loan-detail"); } : canOpenOffer ? () => { setSelectedLoanApplicationId(loan.id); onNavigate("loan-approval"); } : undefined;

          const progressSteps: Array<[string, boolean]> = [
            ["Application submitted", true],
            ["Field verification", (loan.reviewLevel ?? 0) >= 1 || ["offered", "disbursing", "active", "paid", "overdue"].includes(loan.status)],
            ["Credit assessment", (loan.reviewLevel ?? 0) >= 2 || ["offered", "disbursing", "active", "paid", "overdue"].includes(loan.status)],
            ["Final decision", (loan.reviewLevel ?? 0) >= 3 || ["rejected", "offered", "disbursing", "active", "paid", "overdue"].includes(loan.status)],
            ["Agreement signed", Boolean(loan.agreementAccepted)],
            ["Funds received", ["active", "paid", "overdue"].includes(loan.status)],
          ];
          const completedSteps = progressSteps.filter(([, done]) => done).length;
          return (
            <article key={loan.id} style={{ background: "#FFFFFF", borderRadius: 20, padding: "clamp(20px, 2.6vw, 32px)", boxShadow: "0 5px 28px rgba(20,50,30,.055)", border: "1px solid #E3EDE6" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
                  <div style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 14, background: "#E9F5EE", display: "grid", placeItems: "center" }}><FileText size={24} color="#0B5E3A" /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "#60766B", marginBottom: 3, fontWeight: 600 }}>Business credit · {loan.termDays} days</div>
                    <div style={{ fontSize: "clamp(23px, 2.3vw, 30px)", fontWeight: 800, color: "#152A20", letterSpacing: "-0.03em" }}>{ugx(loan.amount)}</div>
                    <div style={{ fontSize: 15, lineHeight: 1.55, color: "#526A5D", marginTop: 6, overflowWrap: "anywhere" }}><UiText text={loan.purpose} /> · Applied {fmtDate(loan.createdAt)}</div>
                  </div>
                </div>
                <div style={{ padding: "9px 14px", borderRadius: 9, background: style.bg, color: style.color, fontSize: 14, fontWeight: 750 }}>{style.label}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 22, padding: "16px 0", borderTop: "1px solid #E8EFEA", borderBottom: "1px solid #E8EFEA" }}>
                <div style={{ flex: "1 1 170px" }}><div style={{ color: "#697F71", fontSize: 14 }}>Agreement reference</div><div style={{ marginTop: 5, fontWeight: 750, fontSize: 16, overflowWrap: "anywhere" }}>{loan.agreementNumber || "Pending reference"}</div></div>
                <div style={{ flex: "1 1 170px" }}><div style={{ color: "#697F71", fontSize: 14 }}>Total repayment</div><div style={{ marginTop: 5, fontWeight: 750, fontSize: 16 }}>{loan.total > 0 ? ugx(loan.total) : "Not yet offered"}</div></div>
                <div style={{ flex: "1 1 170px" }}><div style={{ color: "#697F71", fontSize: 14 }}>{loan.status === "offered" ? "Offer expires" : "Current stage"}</div><div style={{ marginTop: 5, fontWeight: 750, fontSize: 16 }}>{loan.status === "offered" && loan.offerExpiresAt ? fmtDate(loan.offerExpiresAt) : style.label}</div></div>
              </div>
              <div style={{ marginTop: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#143C2A" }}>Application progress</h2>
                  <span style={{ fontSize: 14, color: "#5A7063" }}>{completedSteps} of {progressSteps.length} stages</span>
                </div>
                <div aria-label="Application progress" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
                  {progressSteps.map(([name, done], i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, background: done ? "#EAF6EE" : "#F5F7F6", borderRadius: 12, padding: "13px 12px", minHeight: 56 }}>
                      {done ? <Check size={19} strokeWidth={2.7} color="#167443" style={{ flexShrink: 0 }} /> : loan.status === "disbursing" && i === 5 ? <Clock3 size={19} color="#A16B11" style={{ flexShrink: 0 }} /> : <Circle size={18} color="#81948A" style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: 14, lineHeight: 1.4, fontWeight: done ? 700 : 550, color: done ? "#145937" : "#667B70" }}>{name}</span>
                    </div>
                  ))}
                </div>
                {loan.status === "disbursing" && <p style={{ margin: "15px 0 0", padding: "12px 15px", borderRadius: 10, background: "#FFF8E7", color: "#79550C", fontSize: 15, lineHeight: 1.55 }}>Settlement is pending. Funds may still be awaiting independent Finance release or provider confirmation. Do not treat them as received yet.</p>}
                {loan.status === "offered" && <p style={{ margin: "15px 0 0", color: "#225A3B", fontSize: 15 }}>Your offer is ready. Review the agreement before accepting.</p>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 22 }}>
                {loan.status === "offered" && <button type="button" onClick={() => { setSelectedLoanApplicationId(loan.id); onNavigate("loan-agreement"); }} style={{ border: 0, borderRadius: 11, padding: "14px 18px", background: "#0B5E3A", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Review & sign agreement</button>}
                {action && <button type="button" onClick={action} style={{ display: "inline-flex", gap: 8, alignItems: "center", border: "1px solid #BDD9C7", borderRadius: 11, padding: "13px 17px", background: "white", color: "#0B5E3A", fontSize: 15, fontWeight: 750, cursor: "pointer" }}>View application details <ChevronRight size={18}/></button>}
                {loan.status === "paid" && <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#12613D", fontSize: 15, fontWeight: 700 }}><TrendingUp size={18}/>Fully repaid</span>}
              </div>
              {token && <div style={{ marginTop: 14 }}><GuarantorNomination applicationId={loan.id} token={token} status={loan.status} /></div>}
            </article>
          );
        })}

        {!loading && !error && filtered.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "#87968E" }}><p style={{ fontSize: 15, margin: 0 }}><UiText text={"No records in this category"} /></p></div>}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
