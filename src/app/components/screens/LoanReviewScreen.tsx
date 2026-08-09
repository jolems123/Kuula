import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanQuote, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { localQuote } from "../../lib/pricing";
import { useTranslation } from "react-i18next";
import { getLoanDraft } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

export function LoanReviewScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  useTranslation();
  const token = state.session.token;
  const draft = getLoanDraft();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amount = draft?.amount ?? 500000;
  const termDays = draft?.termDays ?? 90;
  const [quote, setQuote] = useState<LoanQuote>(() => localQuote(amount, termDays, 0));
  useEffect(() => {
    if (env.USE_API && token && draft) api.quoteLoan(token, draft.amount, draft.termDays).then(setQuote).catch(() => {});
  }, [token, draft?.amount, draft?.termDays]);

  if (!draft) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#F7FAF8", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}><h2>Application details expired</h2><p>Return to the loan form so Kuula can review the exact amount, term and affordability information you intend to submit.</p><button className="kuula-primary" onClick={() => onNavigate("loan-apply")}>Return to Application</button></div>
      </div>
    );
  }

  const submit = async () => {
    if (!agreed || loading || !token) return;
    setError(""); setLoading(true);
    if (env.USE_API) {
      try {
        await api.submitApplication(token, draft);
        onNavigate("loan-approval");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not submit your application. Please review your details and try again.");
      } finally { setLoading(false); }
      return;
    }
    setTimeout(() => { setLoading(false); onNavigate("loan-approval"); }, 500);
  };

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #EEF2EF" }}>
      <span style={{ fontSize: 13, color: "#68766F" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: bold ? "#0B5E3A" : "#1F2937", textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F7FAF8", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <button onClick={() => onNavigate("loan-apply")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button>
        <div style={{ marginLeft: 12 }}><span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Review Application</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Confirm the exact information sent for underwriting</span></div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 140px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#EDF8F2", borderRadius: 16, padding: 16, border: "1px solid #B7DEC9" }}>
          <p style={{ fontSize: 12, color: "#425149", fontWeight: 600, margin: "0 0 4px" }}>REQUESTED AMOUNT</p>
          <p style={{ fontSize: 34, fontWeight: 900, color: "#0B5E3A", margin: 0 }}>{ugx(draft.amount)}</p>
          <p style={{ fontSize: 12, color: "#68766F", margin: "4px 0 0" }}>{draft.termDays}-day term · {draft.purpose} · {draft.channel}</p>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Repayment Disclosure</p>
          <Row label="Principal" value={ugx(draft.amount)} />
          <Row label={`Interest (${quote.aprPercent}% APR, simple)`} value={ugx(quote.interest)} />
          <Row label="Service fee" value="UGX 0" />
          <Row label="Total repayment" value={ugx(quote.total)} bold />
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Affordability Declaration</p>
          <Row label="Monthly income" value={ugx(draft.declaredMonthlyIncome)} />
          <Row label="Monthly expenses" value={ugx(draft.declaredMonthlyExpenses)} />
          <Row label="Existing monthly debt" value={ugx(draft.existingDebtPayment)} />
          <p style={{ fontSize: 11, color: "#68766F", lineHeight: 1.55, margin: "12px 0 0" }}>These are declarations, not automatic approval. Kuula’s server also requires current KYC, credit evidence and affordability checks, and rechecks eligibility before approval and disbursement.</p>
        </div>

        <button onClick={() => setAgreed(!agreed)} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: agreed ? "#F0FDF4" : "#FFF", border: `1.5px solid ${agreed ? "#0B5E3A" : "#DDE5E0"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left" }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${agreed ? "#0B5E3A" : "#D1D5DB"}`, background: agreed ? "#0B5E3A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{agreed && <CheckCircle size={14} color="white" />}</div>
          <p style={{ fontSize: 12, color: "#374151", margin: 0, lineHeight: 1.6 }}>I confirm the application and affordability information above is accurate to the best of my knowledge. I understand this is a loan application, not a loan agreement or guarantee of approval.</p>
        </button>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>
        {error && <p style={{ fontSize: 12, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error}</p>}
        <p style={{ fontSize: 10.5, color: "#89948E", textAlign: "center", marginBottom: 10 }}>Any loan is subject to eligibility, applicable disclosures, customer acceptance and provider-confirmed disbursement.</p>
        <button onClick={submit} disabled={!agreed || loading || !token} className="kuula-primary" style={{ width: "100%", height: 52, opacity: !agreed || loading ? .55 : 1 }}>{loading ? "Submitting…" : "Submit Loan Application"}</button>
      </div>
    </div>
  );
}
