import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanQuote, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { localQuote } from "../../lib/pricing";
import { getLoanDraft } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

export function LoanReviewScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const draft = getLoanDraft();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(env.USE_API);

  const fallbackAmount = draft?.amount ?? 50_000;
  const fallbackTerm = draft?.termDays ?? 90;
  const [quote, setQuote] = useState<LoanQuote | null>(() => env.USE_API ? null : localQuote(fallbackAmount, fallbackTerm));

  useEffect(() => {
    let active = true;
    if (!draft) return () => { active = false; };
    if (!env.USE_API) { setQuote(localQuote(draft.amount, draft.termDays)); setQuoteLoading(false); return () => { active = false; }; }
    if (!token) { setQuote(null); setQuoteError("Your session is not available. Sign in again before reviewing this application."); setQuoteLoading(false); return () => { active = false; }; }
    setQuoteLoading(true); setQuoteError(""); setQuote(null);
    api.quoteLoan(token, draft.amount, draft.termDays)
      .then((value) => { if (active) setQuote(value); })
      .catch((err) => { if (active) setQuoteError(err instanceof Error ? err.message : "Could not load the authoritative Kuula quote."); })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [token, draft?.amount, draft?.termDays]);

  if (!draft) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#F7FAF8", padding: 24 }}><div style={{ textAlign: "center", maxWidth: 340 }}><h2>Application details expired</h2><p>Return to the credit form so Kuula can review the exact amount, term and affordability information you intend to submit.</p><button className="kuula-primary" onClick={() => onNavigate("loan-apply")}>Return to Application</button></div></div>;
  }

  const submit = async () => {
    if (!agreed || loading || !token || !quote || quoteLoading || quoteError) return;
    setError(""); setLoading(true);
    if (env.USE_API) {
      try { await api.submitApplication(token, draft); onNavigate("loan-approval"); }
      catch (e) { setError(e instanceof ApiError ? e.message : "Could not submit your application. Please review your details and try again."); }
      finally { setLoading(false); }
      return;
    }
    setTimeout(() => { setLoading(false); onNavigate("loan-approval"); }, 500);
  };

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #EEF2EF" }}><span style={{ fontSize: 13, color: "#68766F" }}>{label}</span><span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: bold ? "#0B5E3A" : "#1F2937", textAlign: "right" }}>{value}</span></div>;
  const canSubmit = Boolean(agreed && !loading && token && quote && !quoteLoading && !quoteError);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F7FAF8", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #087148)" }}><button onClick={() => onNavigate("loan-apply")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button><div style={{ marginLeft: 12 }}><span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Review Application</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Confirm the exact information sent for underwriting</span></div></div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 140px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#EDF8F2", borderRadius: 16, padding: 16, border: "1px solid #B7DEC9" }}><p style={{ fontSize: 12, color: "#425149", fontWeight: 600, margin: "0 0 4px" }}>REQUESTED AMOUNT</p><p style={{ fontSize: 34, fontWeight: 900, color: "#0B5E3A", margin: 0 }}>{ugx(draft.amount)}</p><p style={{ fontSize: 12, color: "#68766F", margin: "4px 0 0" }}>{draft.termDays}-day term · {draft.purpose} · {draft.channel}</p></div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Employment & livelihood</p>
          <Row label="Status" value={draft.employmentStatus} />
          <Row label="Occupation / business" value={draft.occupationOrBusiness} />
          <Row label="Employer / business name" value={draft.employerOrBusinessName || "Not provided"} />
          <Row label="Time in current work" value={draft.workDuration} />
          <Row label="Primary income source" value={draft.incomeSource} />
          <Row label="Primary repayment source" value={draft.repaymentSource} />
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Repayment Disclosure</p>
          {quoteLoading && <p style={{ fontSize: 12, color: "#68766F", margin: "12px 0" }}>Loading Kuula’s current server quote…</p>}
          {quoteError && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", background: "#FEF2F2", borderRadius: 10, padding: 10, margin: "12px 0" }}>{quoteError} Return to the application and try again before submitting.</p>}
          {quote && <><Row label="Principal" value={ugx(quote.principal)} /><Row label={`Interest (${quote.aprPercent}% APR, simple)`} value={ugx(quote.interest)} /><Row label="Service fee" value={ugx(quote.fee)} /><Row label="Total cost of credit" value={ugx(quote.interest + quote.fee)} /><Row label="Total repayment" value={ugx(quote.total)} bold /></>}
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}><p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Affordability Declaration</p><Row label="Monthly income" value={ugx(draft.declaredMonthlyIncome)} /><Row label="Monthly expenses" value={ugx(draft.declaredMonthlyExpenses)} /><Row label="Existing monthly debt" value={ugx(draft.existingDebtPayment)} /><p style={{ fontSize: 11, color: "#68766F", lineHeight: 1.55, margin: "12px 0 0" }}>These are declarations, not automatic approval. Kuula’s server also requires current KYC, credit evidence and affordability checks, and rechecks eligibility before approval and disbursement.</p></div>

        <button disabled={!quote || quoteLoading || Boolean(quoteError)} onClick={() => setAgreed(!agreed)} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: agreed ? "#F0FDF4" : "#FFF", border: `1.5px solid ${agreed ? "#0B5E3A" : "#DDE5E0"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left", opacity: !quote || quoteLoading || quoteError ? .55 : 1 }}><div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${agreed ? "#0B5E3A" : "#D1D5DB"}`, background: agreed ? "#0B5E3A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{agreed && <CheckCircle size={14} color="white" />}</div><p style={{ fontSize: 12, color: "#374151", margin: 0, lineHeight: 1.6 }}>I confirm the application, livelihood and affordability information above is accurate to the best of my knowledge. I understand this is a credit application, not a loan agreement or guarantee of approval.</p></button>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>{error && <p style={{ fontSize: 12, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error}</p>}<p style={{ fontSize: 10.5, color: "#89948E", textAlign: "center", marginBottom: 10 }}>Any credit is subject to eligibility, applicable disclosures, customer acceptance and provider-confirmed settlement.</p><button onClick={submit} disabled={!canSubmit} className="kuula-primary" style={{ width: "100%", height: 52, opacity: canSubmit ? 1 : .55 }}>{loading ? "Submitting…" : quoteLoading ? "Loading Quote…" : "Submit Credit Application"}</button></div>
    </div>
  );
}
