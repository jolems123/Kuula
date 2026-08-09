import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { localQuote } from "../../lib/pricing";
import { setLoanDraft } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }
function formatUGX(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

const METHODS = [
  { id: "MTN MoMo", label: "MTN MoMo", icon: "📱" },
  { id: "Airtel Money", label: "Airtel Money", icon: "📱" },
];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const TERMS = [90, 120, 180];
  const PURPOSES = [
    { key: "Business", label: t("loanPurpose.business") },
    { key: "School Fees", label: t("loanPurpose.schoolFees") },
    { key: "Medical", label: t("loanPurpose.medical") },
    { key: "Farming", label: t("loanPurpose.farming") },
    { key: "Home Repair", label: t("loanPurpose.homeRepair") },
    { key: "Other", label: t("loanPurpose.other") },
  ];
  const [amount, setAmount] = useState(500000);
  const [term, setTerm] = useState(90);
  const [purpose, setPurpose] = useState("Business");
  const [method, setMethod] = useState("MTN MoMo");
  const [income, setIncome] = useState(1_000_000);
  const [expenses, setExpenses] = useState(300_000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [error, setError] = useState("");

  const MIN = 50000;
  const MAX = Math.max(MIN, Math.min(2_000_000, state.loan?.availableCredit || 2_000_000));
  const quote = localQuote(amount, term, 0);

  const continueToReview = () => {
    setError("");
    if (!Number.isFinite(income) || income <= 0) { setError("Enter your average monthly income."); return; }
    if (!Number.isFinite(expenses) || expenses < 0) { setError("Monthly expenses cannot be negative."); return; }
    if (!Number.isFinite(existingDebt) || existingDebt < 0) { setError("Existing monthly debt payments cannot be negative."); return; }
    if (expenses + existingDebt >= income) {
      setError("Your expenses and existing debt leave no disposable monthly income for a new loan.");
      return;
    }
    setLoanDraft({
      amount,
      termDays: term,
      purpose,
      channel: method,
      declaredMonthlyIncome: Math.round(income),
      declaredMonthlyExpenses: Math.round(expenses),
      existingDebtPayment: Math.round(existingDebt),
    });
    onNavigate("loan-review");
  };

  const moneyInput = (label: string, value: number, setter: (value: number) => void, hint: string) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #D8E2DC", borderRadius: 12, background: "white", padding: "0 12px" }}>
        <span style={{ fontSize: 12, color: "#68766F", fontWeight: 700 }}>UGX</span>
        <input type="number" min={0} step={50000} value={value} onChange={(e) => setter(Number(e.target.value))} style={{ flex: 1, height: 46, border: 0, outline: 0, paddingLeft: 10, fontWeight: 700, color: "#13251C" }} />
      </div>
      <span style={{ display: "block", fontSize: 10.5, color: "#89948E", marginTop: 4 }}>{hint}</span>
    </label>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7FAF8", paddingTop: 0 }}>
      <div className="flex items-center px-4 pt-4 pb-4" style={{ background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <button onClick={() => onNavigate("home")} aria-label="Go back" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>{t("loanApply.title")}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 120 }}>
        <div className="p-5 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.loanAmount").toUpperCase()}</label>
          <div className="flex items-baseline gap-2 mt-2"><span style={{ fontSize: 15, fontWeight: 700, color: "#5D6C64" }}>UGX</span><input type="number" value={amount} onChange={(e) => { const v = Number(e.target.value); if (v >= MIN && v <= MAX) setAmount(v); }} style={{ fontSize: 34, fontWeight: 800, color: "#0B5E3A", border: "none", outline: "none", background: "transparent", width: "100%" }} /></div>
          <input type="range" min={MIN} max={MAX} step={50000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", accentColor: "#0B5E3A", marginTop: 12 }} />
          <div className="flex justify-between"><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(MIN)}</span><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(MAX)}</span></div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.repaymentTerm").toUpperCase()}</label>
          <div className="flex gap-2 flex-wrap mt-3">{TERMS.map((d) => <button key={d} onClick={() => setTerm(d)} style={{ padding: "8px 14px", borderRadius: 10, border: term === d ? "none" : "1.5px solid #DDE5E0", background: term === d ? "#0B5E3A" : "white", color: term === d ? "white" : "#374151", fontSize: 13, fontWeight: 600 }}>{d} {t("loanApply.days")}</button>)}</div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.loanPurpose").toUpperCase()}</label>
          <div className="flex gap-2 flex-wrap mt-3">{PURPOSES.map((p) => <button key={p.key} onClick={() => setPurpose(p.key)} style={{ padding: "7px 12px", borderRadius: 20, border: purpose === p.key ? "1px solid #0B5E3A" : "1.5px solid #E5E7EB", background: purpose === p.key ? "#EDF8F2" : "white", color: purpose === p.key ? "#0B5E3A" : "#6B7280", fontSize: 12, fontWeight: 600 }}>{p.label}</button>)}</div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#13251C", margin: "0 0 4px" }}>Affordability information</p>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}>Kuula uses these figures together with verified credit evidence. Final eligibility is recalculated by the server before approval and before disbursement.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {moneyInput("Average monthly income", income, setIncome, "Your typical monthly income before this new loan.")}
            {moneyInput("Monthly living & business expenses", expenses, setExpenses, "Regular monthly expenses excluding loan repayments.")}
            {moneyInput("Existing monthly debt repayments", existingDebt, setExistingDebt, "Set to zero only if you have no existing monthly debt payments.")}
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.disbursementMethod").toUpperCase()}</label>
          <div className="flex flex-col gap-2 mt-3">{METHODS.map((m) => <button key={m.id} onClick={() => setMethod(m.id)} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: method === m.id ? "#EDF8F2" : "#F9FAFB", border: method === m.id ? "1.5px solid #B7DEC9" : "1.5px solid transparent", textAlign: "left" }}><span style={{ fontSize: 20 }}>{m.icon}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", flex: 1 }}>{m.label}</span><span style={{ width: 20, height: 20, borderRadius: 10, border: method === m.id ? "6px solid #0B5E3A" : "2px solid #D1D5DB" }} /></button>)}</div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}>
          <div className="flex justify-between py-1.5"><span>Principal</span><strong>{formatUGX(amount)}</strong></div>
          <div className="flex justify-between py-1.5"><span>Interest ({quote.aprPercent}% APR, simple)</span><strong>{formatUGX(quote.interest)}</strong></div>
          <div className="flex justify-between py-2" style={{ borderTop: "1px solid #EAD277", marginTop: 5 }}><strong>Total repayment</strong><strong style={{ color: "#0B5E3A" }}>{formatUGX(quote.total)}</strong></div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{ background: "white", borderTop: "1px solid #E8EEEA" }}>
        {error && <p style={{ fontSize: 11.5, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error}</p>}
        <button onClick={continueToReview} className="kuula-primary" style={{ width: "100%", height: 52 }}>Review Application</button>
      </div>
    </div>
  );
}
