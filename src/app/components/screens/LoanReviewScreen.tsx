import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanQuote } from "../../api/client";
import { env } from "../../config/env";
import { localQuote } from "../../lib/pricing";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

export function LoanReviewScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const amount = 500000;
  // Pricing is always APR-capped and simple-interest. With the
  // backend on, the exact server quote is used; otherwise an identical local
  // calculation keeps every build compliant.
  const [quote, setQuote] = useState<LoanQuote>(() => localQuote(amount, 90, state.savingsBalance));
  useEffect(() => {
    if (env.USE_API && token) {
      api.quoteLoan(token, amount, 90).then(setQuote).catch(() => {});
    }
  }, [token]);

  const term = quote.termDays;
  const interest = quote.interest;
  const total = quote.total;

  const submit = async () => {
    if (!agreed || loading) return;
    setError("");
    setLoading(true);
    // With the backend on, this creates a real application the admin queue
    // receives; otherwise it simulates the submit for demo builds.
    if (env.USE_API && token) {
      try {
        await api.submitApplication(token, { amount, purpose: "Business", termDays: 90, channel: "MTN MoMo" });
        onNavigate("loan-approval");
      } catch {
        setError("Could not submit your application. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setTimeout(() => { setLoading(false); onNavigate("loan-approval"); }, 2000);
  };

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: bold ? "#0A4A2E" : "#1F2937" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}>
        <button onClick={() => onNavigate("loan-disbursement")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <div style={{ marginLeft: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Review & Confirm</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Step 4 of 4 — Final check</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Loan summary */}
        <div style={{ background: "linear-gradient(135deg, #ECF5F0, #D2E9DD)", borderRadius: 16, padding: "16px", border: "1px solid #B6DCC8" }}>
          <p style={{ fontSize: 12, color: "#157A4E", fontWeight: 600, margin: "0 0 4px" }}>Loan Amount</p>
          <p style={{ fontSize: 34, fontWeight: 900, color: "#0A4A2E", margin: 0, letterSpacing: -1 }}>{ugx(amount)}</p>
          <p style={{ fontSize: 12, color: "#157A4E", margin: "4px 0 0" }}>{term}-day term · Business purpose · MTN MoMo</p>
        </div>

        {/* Breakdown */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>Repayment Breakdown</p>
          <Row label="Principal" value={ugx(amount)} />
          <Row label={`Interest (${quote.aprPercent}% APR, simple)`} value={ugx(interest)} />
          <Row label="Service Fee" value="UGX 0 — no hidden fees" />
          {quote.savingsDiscountApplied && (
            <Row label="Savings discount" value={`−5% APR applied`} />
          )}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>Total Repayment</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#0A4A2E" }}>{ugx(total)}</span>
          </div>
        </div>

        {/* Details */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>Loan Details</p>
          <Row label="Term" value={`${term} days`} />
          <Row label="Disbursement" value="MTN MoMo · +256 770 123 456" />
          <Row label="Purpose" value="Business" />
          <Row label="Representative APR" value={`${quote.aprPercent}% per year`} />
          <Row label="Interest type" value="Simple — never compounded" />
        </div>

        {/* Agreement checkbox */}
        <button
          onClick={() => setAgreed(!agreed)}
          style={{ display: "flex", alignItems: "flex-start", gap: 12, background: agreed ? "#F0FDF4" : "#F9FAFB", border: `1.5px solid ${agreed ? "#10B981" : "#E5E7EB"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${agreed ? "#10B981" : "#D1D5DB"}`, background: agreed ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            {agreed && <CheckCircle size={14} color="white" />}
          </div>
          <p style={{ fontSize: 12, color: "#374151", margin: 0, lineHeight: 1.6 }}>
            I have read and agree to the <span style={{ color: "#0D5C3A", fontWeight: 700 }}>Kuula Loan Agreement</span>, confirm all details above are correct, and authorise Kuula to disburse this loan to my MTN MoMo account.
          </p>
        </button>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {error && <p style={{ fontSize: 12, color: "#EF4444", textAlign: "center", marginBottom: 8 }}>{error}</p>}
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 10 }}>
          No pre-payment penalty. UMRA licensed. Regulated by Bank of Uganda.
        </p>
        <button
          onClick={submit}
          disabled={!agreed || loading}
          style={{
            width: "100%", height: 52, borderRadius: 14, cursor: agreed && !loading ? "pointer" : "not-allowed",
            background: agreed ? "linear-gradient(135deg, #0D5C3A, #0A4A2E)" : "#E5E7EB",
            color: agreed ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          {loading ? (
            <><div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Processing...</>
          ) : "Submit Loan Application"}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
