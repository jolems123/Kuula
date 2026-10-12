import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { localQuote } from "../../lib/pricing";
import { getLoanCalculatorSelection, setLoanCalculatorSelection, setLoanDraft } from "../../lib/selection";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurpose, parseBusinessLoanPurpose, type BusinessLoanPurposeOption } from "../../lib/business-loan-purpose";
import { getSavedLoanApplicationDraft, saveLoanApplicationDraft } from "../../lib/loan-application-autosave";
import { getLoanTermOptions } from "../../lib/loan-terms";

interface Props { onNavigate: (screen: string) => void; }
function formatUGX(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

const MIN_AMOUNT = 50_000;
const PRODUCT_MAX_AMOUNT = 2_000_000;
const METHODS = [
  { id: "MTN MoMo", label: "MTN MoMo", icon: "📱" },
  { id: "Airtel Money", label: "Airtel Money", icon: "📱" },
];
const EMPLOYMENT = ["Employed", "Self-employed", "Business owner", "Other"];
const WORK_DURATION = ["Less than 6 months", "6–12 months", "1–2 years", "2+ years"];
const INCOME_SOURCES = ["Business sales", "Service income", "Salary", "Commission", "Other"];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const TERMS = getLoanTermOptions();
  const [calculatorSelection] = useState(getLoanCalculatorSelection);
  const [savedDraft] = useState(() => state.user ? getSavedLoanApplicationDraft(state.user.id) : null);
  const calculatorPurpose = calculatorSelection ? parseBusinessLoanPurpose(calculatorSelection.purpose) : null;
  const [amount, setAmount] = useState(savedDraft?.amount ?? calculatorSelection?.amount ?? MIN_AMOUNT);
  const validSavedTerm = savedDraft && TERMS.includes(savedDraft.termDays) ? savedDraft.termDays : undefined;
  const validCalculatorTerm = calculatorSelection && TERMS.includes(calculatorSelection.termDays) ? calculatorSelection.termDays : undefined;
  const [term, setTerm] = useState(validSavedTerm ?? validCalculatorTerm ?? TERMS[0]);
  const [purpose, setPurpose] = useState<BusinessLoanPurposeOption>(savedDraft?.purpose ?? calculatorPurpose?.option ?? "Working capital");
  const [otherPurpose, setOtherPurpose] = useState(savedDraft?.otherPurpose ?? calculatorPurpose?.otherDetails ?? "");
  const [method, setMethod] = useState(savedDraft?.method ?? "MTN MoMo");
  const [employmentStatus, setEmploymentStatus] = useState(savedDraft?.employmentStatus ?? "");
  const [occupationOrBusiness, setOccupationOrBusiness] = useState(savedDraft?.occupationOrBusiness ?? "");
  const [employerOrBusinessName, setEmployerOrBusinessName] = useState(savedDraft?.employerOrBusinessName ?? "");
  const [workDuration, setWorkDuration] = useState(savedDraft?.workDuration ?? "");
  const [incomeSource, setIncomeSource] = useState(savedDraft?.incomeSource ?? "");
  const [repaymentSource, setRepaymentSource] = useState(savedDraft?.repaymentSource ?? "");
  const [income, setIncome] = useState(savedDraft?.income ?? 0);
  const [expenses, setExpenses] = useState(savedDraft?.expenses ?? 0);
  const [existingDebt, setExistingDebt] = useState(savedDraft?.existingDebt ?? 0);
  const [saveError, setSaveError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setLoanCalculatorSelection(null); }, []);

  useEffect(() => {
    if (!state.user) return;
    try {
      saveLoanApplicationDraft(state.user.id, {
        amount,
        termDays: term,
        purpose,
        otherPurpose,
        method,
        employmentStatus,
        occupationOrBusiness,
        employerOrBusinessName,
        workDuration,
        incomeSource,
        repaymentSource,
        income,
        expenses,
        existingDebt,
      });
      setSaveError("");
    } catch (saveFailure) {
      console.error("Could not save the loan application draft.", saveFailure);
      setSaveError("Kuula could not save this draft in your browser. Keep this page open so you do not lose your changes.");
    }
  }, [state.user, amount, term, purpose, otherPurpose, method, employmentStatus, occupationOrBusiness, employerOrBusinessName, workDuration, incomeSource, repaymentSource, income, expenses, existingDebt]);

  const availableCredit = Math.max(0, state.loan?.availableCredit ?? 0);
  const maxEligibleAmount = Math.min(PRODUCT_MAX_AMOUNT, availableCredit);
  const canApply = maxEligibleAmount >= MIN_AMOUNT;
  const rangeMax = Math.max(MIN_AMOUNT, maxEligibleAmount);

  useEffect(() => {
    if (!canApply) return;
    setAmount((current) => Math.min(Math.max(current, MIN_AMOUNT), maxEligibleAmount));
  }, [canApply, maxEligibleAmount]);

  const quote = localQuote(amount, term);

  const continueToReview = () => {
    setError("");
    if (!canApply) { setError("No Growth Line is currently available. Complete the required Credit Pass steps and try again when Kuula shows available credit."); return; }
    if (amount < MIN_AMOUNT || amount > maxEligibleAmount) { setError("Choose an amount within your current Growth Line."); return; }
    if (purpose === "Other" && !otherPurpose.trim()) { setError("Describe the other business use for this loan."); return; }
    if (!employmentStatus) { setError("Select your employment or livelihood status."); return; }
    if (!occupationOrBusiness.trim()) { setError("Enter your occupation or business activity."); return; }
    if (!workDuration) { setError("Select how long you have been in your current work or business."); return; }
    if (!incomeSource) { setError("Select your primary income source."); return; }
    if (!repaymentSource.trim()) { setError("Enter the primary source you expect to use for repayment."); return; }
    if (!Number.isFinite(income) || income <= 0) { setError("Enter your average monthly income."); return; }
    if (!Number.isFinite(expenses) || expenses < 0) { setError("Monthly expenses cannot be negative."); return; }
    if (!Number.isFinite(existingDebt) || existingDebt < 0) { setError("Existing monthly debt payments cannot be negative."); return; }
    if (expenses + existingDebt >= income) { setError("Your expenses and existing debt leave no disposable monthly income for new credit."); return; }

    setLoanDraft({
      amount,
      termDays: term,
      purpose: formatBusinessLoanPurpose(purpose, otherPurpose),
      channel: method,
      employmentStatus,
      occupationOrBusiness: occupationOrBusiness.trim(),
      employerOrBusinessName: employerOrBusinessName.trim(),
      workDuration,
      incomeSource,
      repaymentSource: repaymentSource.trim(),
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

  const selectField = (label: string, value: string, setter: (value: string) => void, options: string[]) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}</span>
      <select value={value} onChange={(e) => setter(e.target.value)} style={{ width: "100%", height: 46, border: "1px solid #D8E2DC", borderRadius: 12, padding: "0 12px", background: "white", color: "#13251C", fontWeight: 600 }}>
        <option value="">Select</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );

  const textField = (label: string, value: string, setter: (value: string) => void, placeholder: string, optional = false) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}{optional ? " (optional)" : ""}</span>
      <input value={value} maxLength={120} placeholder={placeholder} onChange={(e) => setter(e.target.value)} style={{ width: "100%", height: 46, border: "1px solid #D8E2DC", borderRadius: 12, padding: "0 12px", background: "white", color: "#13251C", fontWeight: 600 }} />
    </label>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7FAF8", paddingTop: 0 }}>
      <div className="flex items-center px-4 pt-4 pb-4" style={{ background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <button onClick={() => onNavigate("home")} aria-label="Go back" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Kuula Business application</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 120 }}>
        <p role={saveError ? "alert" : "status"} style={{ margin: 0, fontSize: 11, color: saveError ? "#A13A3A" : "#68766F" }}>
          {saveError || (savedDraft ? "Saved progress restored. Your changes save automatically in this browser tab and remain if you go back." : "Your progress saves automatically in this browser tab and remains if you go back or refresh. It clears after sign out or successful submission.")}
        </p>
        {!canApply && <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}><p style={{ fontSize: 13, fontWeight: 800, color: "#6B5414", margin: "0 0 4px" }}>No Growth Line available yet</p><p style={{ fontSize: 11.5, color: "#776628", margin: 0, lineHeight: 1.5 }}>Kuula will not accept a new application until your Credit Pass shows at least {formatUGX(MIN_AMOUNT)} available. Check identity verification, credit evidence and any existing facility.</p></div>}

        <div className="p-5 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: canApply ? 1 : 0.6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.loanAmount").toUpperCase()}</label>
          <div className="flex items-baseline gap-2 mt-2"><span style={{ fontSize: 15, fontWeight: 700, color: "#5D6C64" }}>UGX</span><input disabled={!canApply} type="number" value={amount} onChange={(e) => { const v = Number(e.target.value); if (canApply && v >= MIN_AMOUNT && v <= maxEligibleAmount) setAmount(v); }} style={{ fontSize: 34, fontWeight: 800, color: "#0B5E3A", border: "none", outline: "none", background: "transparent", width: "100%" }} /></div>
          <input disabled={!canApply} type="range" min={MIN_AMOUNT} max={rangeMax} step={50000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", accentColor: "#0B5E3A", marginTop: 12 }} />
          <div className="flex justify-between"><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(MIN_AMOUNT)}</span><span style={{ fontSize: 11, color: "#9CA3AF" }}>{canApply ? formatUGX(maxEligibleAmount) : "Not available"}</span></div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.repaymentTerm").toUpperCase()}</label><div className="flex gap-2 flex-wrap mt-3">{TERMS.map((d) => <button key={d} onClick={() => setTerm(d)} style={{ padding: "8px 14px", borderRadius: 10, border: term === d ? "none" : "1.5px solid #DDE5E0", background: term === d ? "#0B5E3A" : "white", color: term === d ? "white" : "#374151", fontSize: 13, fontWeight: 600 }}>{d} {t("loanApply.days")}</button>)}</div></div>
        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>BUSINESS LOAN PURPOSE</label>
          <p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}>Choose how your business plans to use this credit.</p>
          <div className="flex gap-2 flex-wrap mt-3">
            {BUSINESS_LOAN_PURPOSES.map((option) => <button key={option} type="button" onClick={() => setPurpose(option)} style={{ padding: "7px 12px", borderRadius: 20, border: purpose === option ? "1px solid #0B5E3A" : "1.5px solid #E5E7EB", background: purpose === option ? "#EDF8F2" : "white", color: purpose === option ? "#0B5E3A" : "#6B7280", fontSize: 12, fontWeight: 600 }}>{option}</button>)}
          </div>
          {purpose === "Other" && <label style={{ display: "block", marginTop: 14 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>Describe your business use</span>
            <textarea value={otherPurpose} maxLength={100} onChange={(event) => setOtherPurpose(event.target.value)} placeholder="Tell us what your business will use the loan for" rows={3} style={{ width: "100%", border: "1px solid #D8E2DC", borderRadius: 12, padding: 12, background: "white", color: "#13251C", resize: "vertical" }} />
          </label>}
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#13251C", margin: "0 0 4px" }}>Employment & livelihood</p>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}>Tell us how you currently earn income. These details support underwriting and may be verified during credit review.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {selectField("Employment / livelihood status", employmentStatus, setEmploymentStatus, EMPLOYMENT)}
            {textField("Occupation / business activity", occupationOrBusiness, setOccupationOrBusiness, "e.g. grocery shop, salon, catering")}
            {textField("Employer / business name", employerOrBusinessName, setEmployerOrBusinessName, "e.g. ABC Traders")}
            {selectField("Time in current work / business", workDuration, setWorkDuration, WORK_DURATION)}
            {selectField("Primary income source", incomeSource, setIncomeSource, INCOME_SOURCES)}
            {textField("Primary repayment source", repaymentSource, setRepaymentSource, "e.g. shop sales, service income")}
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#13251C", margin: "0 0 4px" }}>Affordability information</p>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}>Enter your actual current figures. Kuula uses them together with verified credit evidence, and the server recalculates eligibility before approval and again before disbursement.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {moneyInput("Average monthly income", income, setIncome, "Enter your typical monthly income before this new credit.")}
            {moneyInput("Monthly living & business expenses", expenses, setExpenses, "Enter your regular monthly expenses excluding loan repayments.")}
            {moneyInput("Existing monthly debt repayments", existingDebt, setExistingDebt, "Use zero only if you have no existing monthly debt repayments.")}
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.disbursementMethod").toUpperCase()}</label><p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}>Approved business credit is sent to your verified mobile-money account. Kuula may request business or supplier details during review.</p><div className="flex flex-col gap-2 mt-3">{METHODS.map((m) => <button key={m.id} onClick={() => setMethod(m.id)} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: method === m.id ? "#EDF8F2" : "#F9FAFB", border: method === m.id ? "1.5px solid #B7DEC9" : "1.5px solid transparent", textAlign: "left" }}><span style={{ fontSize: 20 }}>{m.icon}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", flex: 1 }}>{m.label}</span><span style={{ width: 20, height: 20, borderRadius: 10, border: method === m.id ? "6px solid #0B5E3A" : "2px solid #D1D5DB" }} /></button>)}</div></div>

        <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}><div className="flex justify-between py-1.5"><span>Principal</span><strong>{formatUGX(amount)}</strong></div><div className="flex justify-between py-1.5"><span>Interest ({quote.aprPercent}% APR, simple)</span><strong>{formatUGX(quote.interest)}</strong></div><div className="flex justify-between py-2" style={{ borderTop: "1px solid #EAD277", marginTop: 5 }}><strong>Total repayment</strong><strong style={{ color: "#0B5E3A" }}>{formatUGX(quote.total)}</strong></div></div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{ background: "white", borderTop: "1px solid #E8EEEA" }}>{error && <p style={{ fontSize: 11.5, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error}</p>}<button disabled={!canApply} onClick={continueToReview} className="kuula-primary" style={{ width: "100%", height: 52, opacity: canApply ? 1 : 0.55, cursor: canApply ? "pointer" : "not-allowed" }}>Review Application</button></div>
    </div>
  );
}
