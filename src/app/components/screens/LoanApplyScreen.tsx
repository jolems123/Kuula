import { LocalizedFileInput } from "../LocalizedFileInput";
import { UiText, uiText } from "../../../i18n/ui-text";
import { checkLoanForm, type LoanFormIssue } from "../../lib/loan-form-checks";
import { api } from "../../api/client";
import { ArrowLeft, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { getBusinessPhotos, setBusinessPhotos, prepareBusinessPhoto, type BusinessPhotoType, type BusinessPhotoFiles } from "../../lib/business-photos";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { getLoanCalculatorSelection, setLoanCalculatorSelection, setLoanDraft } from "../../lib/selection";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurposes, parseBusinessLoanPurposes, type BusinessLoanPurposeOption } from "../../lib/business-loan-purpose";
import { getSavedLoanApplicationDraft, saveLoanApplicationDraft } from "../../lib/loan-application-autosave";
import { getLoanTermOptions } from "../../lib/loan-terms";
import type { BusinessDetails, BusinessProfile } from "../../api/types";
import { BusinessLocationMap } from "../BusinessLocationMap";
import { captureLocation } from "../../lib/location";

interface Props { onNavigate: (screen: string) => void; }
function formatUGX(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

const MIN_AMOUNT = 50_000;
const PRODUCT_MAX_AMOUNT = 2_000_000;
const METHODS = [
  { id: "MTN MoMo", label: "MTN MoMo", icon: "📱" },
  { id: "Airtel Money", label: "Airtel Money", icon: "📱" },
];
const EMPTY_BUSINESS: BusinessDetails = {
  businessName: "", applicantPosition: "", locationSource: "none", locationCapturedAt: null, locationAccuracyMeters: null, sector: "", tradingAs: "informal", registrationNumber: "",
  tradingMonths: 0, district: "", physicalAddress: "", latitude: null, longitude: null, goodsOrServices: "",
  customerType: "", primarySuppliers: "", supplierPaymentTerms: "", salesFrequency: "unknown", seasonalPattern: "", lowSeasonMonthlySales: 0, inventoryCost: 0, rentCost: 0, wagesCost: 0, otherOperatingCosts: 0, otherDebtDetails: "", staffCount: 0, preferredRepaymentFrequency: "at_maturity", useOfFunds: { stock: 0, equipment: 0, operations: 0, expansion: 0, other: 0 }, loanUse: "", repaymentPlan: "", guarantors: [{ name: "", phone: "" }, { name: "", phone: "" }],
};
function durationBand(months: number): string {
  if (months < 6) return "Less than 6 months";
  if (months < 12) return "6–12 months";
  if (months < 24) return "1–2 years";
  return "2+ years";
}
const SECTORS = ["Retail / shop", "Wholesale / trading", "Agriculture", "Food and hospitality",
  "Transport and logistics", "Manufacturing", "Beauty and personal care", "Professional services", "Other"];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const TERMS = getLoanTermOptions();
  const [calculatorSelection] = useState(getLoanCalculatorSelection);
  const [savedDraft] = useState(() => state.user ? getSavedLoanApplicationDraft(state.user.id) : null);
  const calculatorPurpose = calculatorSelection ? parseBusinessLoanPurposes(calculatorSelection.purpose) : null;
  const [amount, setAmount] = useState(savedDraft?.amount ?? calculatorSelection?.amount ?? MIN_AMOUNT);
  const validSavedTerm = savedDraft && TERMS.includes(savedDraft.termDays) ? savedDraft.termDays : undefined;
  const validCalculatorTerm = calculatorSelection && TERMS.includes(calculatorSelection.termDays) ? calculatorSelection.termDays : undefined;
  const [term, setTerm] = useState(validSavedTerm ?? validCalculatorTerm ?? TERMS[0]);
  const [purposes, setPurposes] = useState<BusinessLoanPurposeOption[]>(savedDraft?.purposes ?? (savedDraft ? [savedDraft.purpose] : calculatorPurpose?.options ?? ["Working capital"]));
  const [otherPurpose, setOtherPurpose] = useState(savedDraft?.otherPurpose ?? calculatorPurpose?.otherDetails ?? "");
  const [method, setMethod] = useState(savedDraft?.method ?? "MTN MoMo");
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>({ ...EMPTY_BUSINESS, ...savedDraft?.businessDetails });
  const [income, setIncome] = useState(savedDraft?.income ?? 0);
  const [expenses, setExpenses] = useState(savedDraft?.expenses ?? 0);
  const [existingDebt, setExistingDebt] = useState(savedDraft?.existingDebt ?? 0);
  const [saveError, setSaveError] = useState("");
  const [showChecks, setShowChecks] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<'loading' | 'approved' | 'blocked' | 'error'>('loading');
  const checkIdentity = async () => {
    if (!state.session.token) { setIdentityStatus('blocked'); return false; }
    try {
      const { kyc } = await api.getKycStatus(state.session.token);
      const approved = kyc.loanEligible === true;
      setIdentityStatus(approved ? 'approved' : 'blocked');
      return approved;
    } catch { setIdentityStatus('error'); return false; }
  };
  useEffect(() => { let active = true; const refresh = () => { if (active) void checkIdentity(); }; refresh(); window.addEventListener('focus', refresh); return () => { active = false; window.removeEventListener('focus', refresh); }; }, [state.session.token]);
  const [photos, setPhotos] = useState<BusinessPhotoFiles>(() => getBusinessPhotos().files);
  const [photoConsent, setPhotoConsent] = useState(() => getBusinessPhotos().consent);
  const [photoError, setPhotoError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [locationError, setLocationError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setLoanCalculatorSelection(null); }, []);
  useEffect(() => { setBusinessPhotos(photos, photoConsent); }, [photos, photoConsent]);

  useEffect(() => {
    if (!state.user) return;
    try {
      saveLoanApplicationDraft(state.user.id, {
        amount,
        termDays: term,
        purpose: purposes[0] ?? "Working capital",
        purposes,
        otherPurpose,
        method,
        employmentStatus: "Business owner",
        occupationOrBusiness: businessDetails.goodsOrServices,
        employerOrBusinessName: businessDetails.businessName,
        workDuration: durationBand(businessDetails.tradingMonths),
        incomeSource: "Business sales",
        repaymentSource: businessDetails.repaymentPlan,
        businessDetails,
        income,
        expenses,
        existingDebt,
      });
      setSaveError("");
    } catch (saveFailure) {
      console.error("Could not save the loan application draft.", saveFailure);
      setSaveError("Kuula could not save this draft in your browser. Keep this page open so you do not lose your changes.");
    }
  }, [state.user, amount, term, purposes, otherPurpose, method, businessDetails, income, expenses, existingDebt]);

  const availableCredit = Math.max(0, state.loan?.availableCredit ?? 0);
  // Growth Line indicates a pre-assessed offer, not eligibility to START a
  // business application. The server independently validates underwriting.
  const maxEligibleAmount = PRODUCT_MAX_AMOUNT;
  const canApply = true;
  const rangeMax = PRODUCT_MAX_AMOUNT;

  useEffect(() => {
    if (!canApply) return;
    setAmount((current) => Math.min(Math.max(current, MIN_AMOUNT), maxEligibleAmount));
  }, [canApply, maxEligibleAmount]);

  const businessCoordinatesAvailable = Number.isFinite(businessDetails.latitude) && Number.isFinite(businessDetails.longitude);

  const captureBusinessLocation = async () => {
    if (locationLoading) return;
    setLocationError("");
    setLocationLoading(true);
    try {
      const point = await captureLocation();
      setBusinessDetails(current => ({ ...current, latitude: point.latitude, longitude: point.longitude, locationSource: "gps", locationCapturedAt: point.capturedAt, locationAccuracyMeters: point.accuracy }));
      setManualLatitude(String(point.latitude)); setManualLongitude(String(point.longitude));
      setShowMap(true);
    } catch (error) { setLocationError(error instanceof Error ? error.message : "Could not capture location."); }
    finally { setLocationLoading(false); }
  };

  const setManualPin = () => {
    setLocationError("");
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!manualLatitude.trim() || !manualLongitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setLocationError("Enter valid latitude (-90 to 90) and longitude (-180 to 180) to place the pin.");
      return;
    }
    setBusinessDetails(current => ({ ...current, latitude, longitude, locationSource: "manual", locationCapturedAt: new Date().toISOString(), locationAccuracyMeters: null }));
    setShowMap(true);
  };

  const adjustPin = (latitudeOffset: number, longitudeOffset: number) => {
    if (businessDetails.latitude == null || businessDetails.longitude == null) return;
    setBusinessDetails(current => ({
      ...current,
      latitude: Math.max(-90, Math.min(90, current.latitude! + latitudeOffset)),
      longitude: Math.max(-180, Math.min(180, current.longitude! + longitudeOffset)),
      locationSource: "manual", locationAccuracyMeters: null, locationCapturedAt: new Date().toISOString(),
    }));
  };

  const pickPhoto = async (kind: BusinessPhotoType, file?: File) => {
    setPhotoError("");
    if (!file) return;
    try {
      const prepared = await prepareBusinessPhoto(file);
      setPhotos(prev => {
        if (kind === "stock_equipment" || kind === "collateral_asset") {
          const current = prev[kind];
          const list = Array.isArray(current) ? current : current ? [current] : [];
          if (list.length >= 8) { setPhotoError("Maximum 8 photographs per category."); return prev; }
          return { ...prev, [kind]: [...list, prepared] };
        }
        return { ...prev, [kind]: prepared };
      });
    } catch (err) { setPhotoError(err instanceof Error ? err.message : "Unable to prepare photograph"); }
  };


  const issues = checkLoanForm({ amount, term, purposes, otherPurpose, business: businessDetails, income, expenses, debt: existingDebt, photos, consent: photoConsent, identityApproved: identityStatus === 'approved' });
  const goToIssue = (issue: LoanFormIssue) => {
    setError(issue.message);
    requestAnimationFrame(() => {
      const target = document.getElementById(issue.target);
      if (!target) return;
      let parent: HTMLElement | null = target;
      while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      if (!target.matches('input, select, textarea, button, a')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: target.matches('input, select, textarea, button, a') ? 'center' : 'start' });
    });
  };
  useEffect(() => {
    document.querySelectorAll('[data-loan-invalid]').forEach(element => { element.removeAttribute('aria-invalid'); element.removeAttribute('aria-errormessage'); element.removeAttribute('data-loan-invalid'); });
    if (!showChecks) return;
    issues.forEach((issue, index) => { const target = document.getElementById(issue.target); target?.setAttribute('aria-invalid', 'true'); target?.setAttribute('aria-errormessage', `loan-check-${index}`); target?.setAttribute('data-loan-invalid', 'true'); });
    if (error && !issues.some(issue => issue.message === error)) setError('');
  }, [showChecks, JSON.stringify(issues)]);
  const continueToReview = async () => {
    setError(''); setShowChecks(true);
    if (issues.length) { goToIssue(issues[0]); return; }
    if (!await checkIdentity()) { goToIssue({target:'loan-identity', message:'Identity approval could not be confirmed. Check your verification status before applying.'}); return; }
    const business: BusinessProfile = {
      ...businessDetails,
      monthlySales: Math.round(income),
      monthlyBusinessExpenses: Math.round(expenses),
      monthlyExistingDebt: Math.round(existingDebt),
    };
    setLoanDraft({
      business,
      amount,
      termDays: term,
      purpose: formatBusinessLoanPurposes(purposes, otherPurpose),
      channel: method,
      employmentStatus: "Business owner",
      occupationOrBusiness: business.goodsOrServices,
      employerOrBusinessName: business.businessName,
      workDuration: durationBand(business.tradingMonths),
      incomeSource: "Business sales",
      repaymentSource: business.repaymentPlan,
      declaredMonthlyIncome: Math.round(income),
      declaredMonthlyExpenses: Math.round(expenses),
      existingDebtPayment: Math.round(existingDebt),
    });
    onNavigate("loan-review");
  };

  const businessTextField = (label: string, key: keyof BusinessDetails, placeholder: string) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={label} /></span>
      <input id={`loan-${key}`} value={String(businessDetails[key])} maxLength={key === "goodsOrServices" || key === "loanUse" || key === "repaymentPlan" ? 300 : 120} placeholder={uiText(placeholder)}
        onChange={(e) => setBusinessDetails((v) => ({ ...v, [key]: e.target.value }))}
        className="kx-input" style={{ width: "100%" }} />
    </label>
  );
  const businessNumberField = (label: string, key: "tradingMonths" | "staffCount", min: number) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={label} /></span>
      <input id={`loan-${key}`} type="number" min={min} step={1} value={businessDetails[key]}
        onChange={(e) => setBusinessDetails((v) => ({ ...v, [key]: Number(e.target.value) }))}
        className="kx-input" style={{ width: "100%" }} />
    </label>
  );
  const moneyInput = (label: string, value: number, setter: (value: number) => void, hint: string) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={label} /></span>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #D8E2DC", borderRadius: 12, background: "white", padding: "0 12px" }}>
        <span style={{ fontSize: 12, color: "#68766F", fontWeight: 700 }}><UiText text={"UGX"} /></span>
        <input id={label === "Average monthly business sales" ? "loan-income" : label === "Total monthly operating expenses" ? "loan-expenses" : "loan-debt"} type="number" min={0} step={1} value={value} onChange={(e) => setter(Number(e.target.value))} style={{ flex: 1, height: 46, border: 0, outline: 0, paddingLeft: 10, fontWeight: 700, color: "#13251C" }} />
      </div>
      <span style={{ display: "block", fontSize: 10.5, color: "#89948E", marginTop: 4 }}><UiText text={hint} /></span>
    </label>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7FAF8", paddingTop: 0 }}>
      <div className="flex items-center px-4 pt-4 pb-4" style={{ background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <button onClick={() => onNavigate("home")} aria-label={uiText("Go back")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}><UiText text={"Kuula Business application"} /></span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 120 }}>
        <p role={saveError ? "alert" : "status"} style={{ margin: 0, fontSize: 11, color: saveError ? "#A13A3A" : "#68766F" }}>
          {saveError || (savedDraft ? "Saved progress restored. Your changes save automatically in this browser tab and remain if you go back." : "Your progress saves automatically in this browser tab and remains if you go back or refresh. It clears after sign out or successful submission.")}
        </p>
        <section className="kuula-application-guide" aria-labelledby="loan-guide-title">
          <h2 id="loan-guide-title"><UiText text={"Your loan application guide"} /></h2>
          <p><UiText text={"Complete the steps below. You can save a draft now; applying requires approved identity documents."} /></p>
          <details><summary><UiText text={"Step-by-step help with amounts and documents"} /></summary><ol><li><UiText text={"Choose the amount you need and a term. Enter whole Uganda shillings, without commas."} /></li><li><UiText text={"Select every business purpose that applies."} /></li><li><UiText text={"Give your business details, pin the premises and attach the three business photos with consent."} /></li><li><UiText text={"Enter your usual monthly sales, expenses and any current loan payments. These are monthly figures, not the loan amount."} /></li><li><UiText text={"Add two guarantor contacts. They are only contacts at this point; a separate agreement is required before anyone can guarantee a loan."} /></li><li><UiText text={"Check your answers, review the application, then confirm submission. Approval and loan pricing follow Kuula’s assessment."} /></li></ol></details>
          <div id="loan-identity" tabIndex={-1}>
            <strong><UiText text={"Identity documents: "} /><UiText text={identityStatus === 'approved' ? 'verified and approved' : identityStatus === 'loading' ? 'checking status…' : identityStatus === 'error' ? 'status unavailable — retry before applying' : 'approval required before applying'} /></strong>
            {identityStatus !== 'approved' && <p><UiText text={"Uploading documents alone is not approval. Open Identity Verification to submit missing documents, read a rejection reason or wait for review."} /></p>}
            <button type="button" className="kx-map-toggle" onClick={() => onNavigate('kyc')}><UiText text={"Open Identity Verification"} /></button>
            <button type="button" className="kx-map-toggle" onClick={() => void checkIdentity()}><UiText text={"Refresh verification status"} /></button>
          </div>
          <p role="status"><UiText text={issues.length ? issues.length + ' checks still need attention.' : 'All form checks passed. Your identity status will be checked again before review.'} /></p>
          <button type="button" className="kx-map-toggle" onClick={() => { setShowChecks(true); if (issues.length) goToIssue(issues[0]); }}><UiText text={"Check my application"} /></button>
          {showChecks && issues.length > 0 && <div role="alert"><h3><UiText text={"Complete these items"} /></h3><ul>{issues.map((issue, index) => <li key={issue.target + index}><button id={`loan-check-${index}`} type="button" onClick={() => goToIssue(issue)}><UiText text={issue.message} /></button></li>)}</ul></div>}
        </section>
        {availableCredit === 0 && <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}><p style={{ fontSize: 13, fontWeight: 800, color: "#6B5414", margin: "0 0 4px" }}><UiText text={"No pre-assessed Growth Line"} /></p><p style={{ fontSize: 11.5, color: "#776628", margin: 0, lineHeight: 1.5 }}><UiText text={"You can complete a business-loan application. The amount you request is not pre-approved; Kuula will review verification, business evidence, affordability and credit policy before making a decision."} /></p></div>}

        <div className="p-5 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: canApply ? 1 : 0.6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.loanAmount").toUpperCase()}</label>
          <div className="flex items-baseline gap-2 mt-2"><span style={{ fontSize: 15, fontWeight: 700, color: "#5D6C64" }}><UiText text={"UGX"} /></span><input id="loan-amount" aria-label={uiText("Requested loan amount")} disabled={!canApply} type="number" value={amount} onChange={(e) => { const v = Number(e.target.value); if (canApply) setAmount(v); }} style={{ fontSize: 34, fontWeight: 800, color: "#0B5E3A", border: "none", outline: "none", background: "transparent", width: "100%" }} /></div>
          <input disabled={!canApply} type="range" min={MIN_AMOUNT} max={rangeMax} step={50000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", accentColor: "#0B5E3A", marginTop: 12 }} />
          <div className="flex justify-between"><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(MIN_AMOUNT)}</span><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(maxEligibleAmount)}</span></div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.repaymentTerm").toUpperCase()}</label><div id="loan-term" className="flex gap-2 flex-wrap mt-3">{TERMS.map((d) => <button key={d} onClick={() => setTerm(d)} style={{ padding: "8px 14px", borderRadius: 10, border: term === d ? "none" : "1.5px solid #DDE5E0", background: term === d ? "#0B5E3A" : "white", color: term === d ? "white" : "#374151", fontSize: 13, fontWeight: 600 }}>{d} {t("loanApply.days")}</button>)}</div></div>
        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}><UiText text={"BUSINESS LOAN PURPOSES"} /></label>
          <p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}><UiText text={"Select every business purpose that applies. A loan officer will confirm the final use during review."} /></p>
          <div id="loan-purposes" className="flex gap-2 flex-wrap mt-3">
            {BUSINESS_LOAN_PURPOSES.map((option) => <button key={option} type="button" className="kuula-purpose-choice" aria-label={uiText(option === "Other" ? "Other business purpose" : option)} aria-pressed={purposes.includes(option)} onClick={() => setPurposes(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option])} style={{ padding: "7px 12px", borderRadius: 20, border: purposes.includes(option) ? "1px solid #0B5E3A" : "1.5px solid #E5E7EB", background: purposes.includes(option) ? "#EDF8F2" : "white", color: purposes.includes(option) ? "#0B5E3A" : "#6B7280", fontSize: 12, fontWeight: 600 }}><UiText text={purposes.includes(option) ? "✓ " : ""} /><UiText text={option === "Other" ? "Other business purpose" : option} /></button>)}
          </div>
          <p role="status" style={{ marginTop: 12, fontSize: 13 }}>{purposes.length}<UiText text={" purposes selected. Click a selected purpose to remove it."} /></p>
          {purposes.includes("Other") && <label style={{ display: "block", marginTop: 14 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={"Describe your business use"} /></span>
            <textarea id="loan-other-purpose" aria-label={uiText("Describe your business use")} value={otherPurpose} maxLength={100} onChange={(event) => setOtherPurpose(event.target.value)} placeholder={uiText("Tell us what your business will use the loan for")} rows={3} style={{ width: "100%", border: "1px solid #D8E2DC", borderRadius: 12, padding: 12, background: "white", color: "#13251C", resize: "vertical" }} />
          </label>}
        </div>

        <section className="p-4 rounded-2xl" style={{ background: "white" }} aria-label={uiText("Business profile")}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#13251C", margin: "0 0 5px" }}><UiText text={"Tell us about your business"} /></h2>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}><UiText text={"We lend only for businesses. A Kuula officer will verify these declarations before approval. Both formally registered and informal businesses can be assessed."} /></p>
          <div style={{ display: "grid", gap: 14 }}>
            {businessTextField("Business or trading name", "businessName", "e.g. Amina's Grocery")}
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={"Your position in this business"} /></span>
              <select id="loan-applicantPosition" value={businessDetails.applicantPosition} className="kx-input" style={{ width: "100%" }}
                onChange={event => setBusinessDetails(current => ({ ...current, applicantPosition: event.target.value }))}>
                <option value=""><UiText text={"Choose your position"} /></option>
                {["Owner", "Co-owner", "Director", "Manager", "Operator", "Other authorized representative"].map(position =>
                  <option value={position} key={position}><UiText text={position} /></option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={"Business sector"} /></span>
              <select id="loan-sector" value={businessDetails.sector} onChange={(e) => setBusinessDetails((v) => ({ ...v, sector: e.target.value }))} className="kx-input" style={{ width: "100%" }}>
                <option value=""><UiText text={"Select your sector"} /></option>
                {SECTORS.map((sector) => <option key={sector} value={sector}><UiText text={sector} /></option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}><UiText text={"Registration status"} /></span>
              <select value={businessDetails.tradingAs} onChange={(e) => setBusinessDetails((v) => ({ ...v, tradingAs: e.target.value as BusinessDetails["tradingAs"] }))} className="kx-input" style={{ width: "100%" }}>
                <option value="informal"><UiText text={"Informal / not formally registered"} /></option>
                <option value="registered"><UiText text={"Registered business"} /></option>
              </select>
            </label>
            {businessDetails.tradingAs === "registered" && businessTextField("Business registration number", "registrationNumber", "Registration / URSB number")}
            {businessNumberField("Months this business has operated", "tradingMonths", 1)}
            {businessTextField("District", "district", "e.g. Wakiso")}
            {businessTextField("Business location / address", "physicalAddress", "Trading centre, street, shop or market")}
            <div style={{ border: "1px solid #DCE7E1", borderRadius: 14, padding: 12, background: "#FBFDFC" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ width: 36, height: 36, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 11, color: "#0B5E3A", background: "#EAF5EF" }}><MapPin size={19} /></span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 13, color: "#183025" }}><UiText text={"Pin your exact business location"} /></strong>
                  <span style={{ display: "block", marginTop: 4, color: "#68766F", fontSize: 11, lineHeight: 1.5 }}><UiText text={"Use your device GPS to add a precise map pin. Your location is included with this loan application for business verification."} /></span>
                </div>
              </div>
              <button type="button" onClick={captureBusinessLocation} disabled={locationLoading} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 42, marginTop: 12, padding: "0 13px", border: "1px solid #B7DEC9", borderRadius: 11, background: "white", color: "#0B5E3A", fontSize: 12, fontWeight: 700, opacity: locationLoading ? 0.65 : 1 }}>
                <LocateFixed size={16} /><UiText text={locationLoading ? "Finding your location…" : businessCoordinatesAvailable ? "Update my location" : "Use my current location"} />
              </button>
              <button type="button" className="kx-map-toggle" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => setShowMap(value => !value)}><UiText text={showMap ? "Hide map" : "Choose location on map"} /></button>
              {showMap && <BusinessLocationMap point={businessCoordinatesAvailable ? { latitude: businessDetails.latitude!, longitude: businessDetails.longitude! } : null} onSelect={point => {
                setBusinessDetails(current => ({ ...current, ...point, locationSource: "manual", locationCapturedAt: new Date().toISOString(), locationAccuracyMeters: null }));
                setManualLatitude(point.latitude.toFixed(6)); setManualLongitude(point.longitude.toFixed(6)); setLocationError("");
              }} />}
              <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#F2F8F4" }}>
                <strong style={{ fontSize: 12, color: "#173D29" }}><UiText text={"Or place the pin using coordinates"} /></strong>
                <p style={{ margin: "5px 0", color: "#61736A", fontSize: 11 }}><UiText text={"If you are away from the premises, obtain the correct latitude and longitude from your map app. Do not use your home location for a separate business."} /></p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ flex: "1 1 110px", fontSize: 11 }}><UiText text={"Latitude "} /><input id="loan-location" aria-label={uiText("Business latitude")} inputMode="decimal" type="number" step="any" min={-90} max={90} className="kx-input" style={{ width: "100%" }} value={manualLatitude} onChange={event => setManualLatitude(event.target.value)} placeholder="0.347596" />
                  </label>
                  <label style={{ flex: "1 1 110px", fontSize: 11 }}><UiText text={"Longitude "} /><input aria-label={uiText("Business longitude")} inputMode="decimal" type="number" step="any" min={-180} max={180} className="kx-input" style={{ width: "100%" }} value={manualLongitude} onChange={event => setManualLongitude(event.target.value)} placeholder="32.582520" />
                  </label>
                </div>
                <button type="button" onClick={setManualPin} style={{ marginTop: 8, padding: "9px 13px", border: "1px solid #9CC9B0", background: "white", borderRadius: 9, color: "#0B5E3A", fontSize: 12, fontWeight: 700 }}><UiText text={"Place manual pin"} /></button>
              </div>
              {locationError && <p role="alert" style={{ margin: "9px 0 0", color: "#A13A3A", fontSize: 11, lineHeight: 1.5 }}>{locationError}</p>}
              {businessCoordinatesAvailable && <>
                <p style={{ margin: "10px 0 8px", color: "#53635A", fontSize: 11 }}><UiText text={"Pinned coordinates: "} />{businessDetails.latitude!.toFixed(6)}, {businessDetails.longitude!.toFixed(6)} · <UiText text={businessDetails.locationSource === "gps" ? `GPS accuracy ~${businessDetails.locationAccuracyMeters ?? "unknown"} m` : "Manually positioned"} /></p>
                <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => adjustPin(0.0001, 0)} aria-label={uiText("Move business pin north")} className="kx-pin-nudge"><UiText text={"↑ North"} /></button>
                  <button type="button" onClick={() => adjustPin(-0.0001, 0)} aria-label={uiText("Move business pin south")} className="kx-pin-nudge"><UiText text={"↓ South"} /></button>
                  <button type="button" onClick={() => adjustPin(0, -0.0001)} aria-label={uiText("Move business pin west")} className="kx-pin-nudge"><UiText text={"← West"} /></button>
                  <button type="button" onClick={() => adjustPin(0, 0.0001)} aria-label={uiText("Move business pin east")} className="kx-pin-nudge"><UiText text={"→ East"} /></button>
                </div>
                <a href={`https://www.openstreetmap.org/?mlat=${businessDetails.latitude}&mlon=${businessDetails.longitude}#map=17/${businessDetails.latitude}/${businessDetails.longitude}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#0B5E3A", fontSize: 11, fontWeight: 700 }}><UiText text={"Open pin in map"} /></a>
              </>}
              <span style={{ display: "block", marginTop: 9, color: "#89948E", fontSize: 10, lineHeight: 1.45 }}><UiText text={"The map loads from OpenStreetMap when you choose to open it. GPS is captured only when you tap the location button; there is no background tracking. A business address is required. Confirm the pin matches your real business premises."} /></span>
            </div>
            {businessTextField("Main products or services", "goodsOrServices", "What does the business sell or provide?")}
          </div>
        </section>

        <section className="p-4 rounded-2xl" style={{ background: "white" }} aria-label={uiText("Business photographs")}>
          <h2 id="loan-photos" style={{ fontSize: 16, fontWeight: 800, margin: "0 0 6px", color: "#13251C" }}><UiText text={"Business photos and premises evidence"} /></h2>
          <p style={{ fontSize: 12, color: "#68766F", lineHeight: 1.5 }}><UiText text={"Take clear, recent photos at your real place of business. A Kuula reviewer will inspect them. Uploading a photo does not verify your business automatically."} /></p>
          {([
            ["exterior", "Business exterior", "Show the entrance and surrounding premises.", "environment"],
            ["interior", "Inside your business", "Show your workspace, shelves or equipment.", "environment"],
            ["applicant_at_business", "You at your business", "Include your face AND identifiable business surroundings in one photo.", "user"],
            ["stock_equipment", "Stock or equipment (optional)", "Photograph merchandise, tools or working equipment.", "environment"],
            ["collateral_asset", "Pledged security / collateral (optional)", "Photograph the actual asset offered as security. Include identifiable features; photos alone do not prove ownership or valuation.", "environment"],
          ] as const).map(([kind, label, hint, camera]) => (
            <div key={kind} style={{ borderTop: "1px solid #E4EBE6", padding: "12px 0" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#153826" }}><UiText text={label} /><UiText text={kind !== "stock_equipment" && kind !== "collateral_asset" ? " *" : ""} /></label>
              <p style={{ fontSize: 11, margin: "5px 0", color: "#64766C" }}><UiText text={hint} /></p>
              <LocalizedFileInput type="file" accept="image/*" capture={camera} aria-label={uiText(label)}
                onChange={event => { const file = event.target.files?.[0]; if (file) void pickPhoto(kind, file); event.target.value = ""; }}
                style={{ width: "100%", fontSize: 12 }} />
              {(kind === "stock_equipment" || kind === "collateral_asset") && <p style={{fontSize:11,color:"#53635A"}}>Up to 8 different photos. Add views of separate assets or their condition, serial numbers and ownership markings.</p>}
              {(Array.isArray(photos[kind]) ? photos[kind] : photos[kind] ? [photos[kind]] : []).map((file, index) => (
                <div key={index} style={{marginTop:8}}>
                  <img src={URL.createObjectURL(file)} alt={label + " photo " + (index + 1)} onLoad={event => URL.revokeObjectURL(event.currentTarget.src)}
                    style={{display:"block",maxWidth:"100%",maxHeight:200,objectFit:"contain",borderRadius:10}} />
                  <button type="button" onClick={() => setPhotos(prev => {
                    const current = prev[kind];
                    const list = Array.isArray(current) ? current : current ? [current] : [];
                    const next = {...prev};
                    const updated = list.filter((_,i)=>i!==index);
                    if (updated.length) next[kind] = updated; else delete next[kind];
                    return next;
                  })} style={{marginTop:7,padding:7,border:"1px solid #BBD4C5",background:"white",borderRadius:8}}>
                    <UiText text={"Remove photo " + (index + 1)} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {photoError && <p role="alert" style={{ color: "#A13A3A", fontSize: 12 }}><UiText text={photoError} /></p>}
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12, lineHeight: 1.6, color: "#243A2B" }}>
            <input id="loan-photo-consent" type="checkbox" checked={photoConsent} onChange={event => setPhotoConsent(event.target.checked)} /><UiText text={" I consent to Kuula securely storing these photographs for business verification, underwriting review, fraud prevention and applicable record retention. I confirm the images are of my business and I have permission to submit them. "} /></label>
          <p style={{ fontSize: 11, color: "#8A7661" }}><UiText text={"Photos are kept only in memory until submission. If you refresh or close the app, take them again. They are not saved in your browser's application draft."} /></p>
        </section>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <p id="loan-finances" style={{ fontSize: 13, fontWeight: 800, color: "#13251C", margin: "0 0 4px" }}><UiText text={"Affordability information"} /></p>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}><UiText text={"Use your best monthly estimate. These three figures let Kuula assess affordability; an officer may confirm them with you."} /></p>
          <div style={{ display: "grid", gap: 14 }}>
            {moneyInput("Average monthly business sales", income, setIncome, "Business revenue before any costs; do not enter gross profit or your personal salary.")}
            {moneyInput("Total monthly operating expenses", expenses, setExpenses, "Include stock purchases, rent, wages, utilities and other operating costs. Exclude loan repayments.")}
            {moneyInput("Existing monthly debt repayments", existingDebt, setExistingDebt, "Include payments for every other loan or supplier financing arrangement.")}
            <div style={{ background: "#F7FAF8", borderRadius: 11, padding: 12, fontSize: 12, color: "#244636" }}><UiText text={" Declared monthly surplus before the proposed Kuula repayment: "} /><strong>{formatUGX(Math.max(0, income - expenses - existingDebt))}</strong>
              <p style={{ margin: "7px 0 0", fontSize: 11, color: "#68766F" }}><UiText text={"An estimate from your declarations, not your approved repayment capacity. Kuula applies conservative underwriting independently."} /></p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.disbursementMethod").toUpperCase()}</label><p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}><UiText text={"Approved business credit is sent to your verified mobile-money account. Kuula may request business or supplier details during review."} /></p><div className="flex flex-col gap-2 mt-3">{METHODS.map((m) => <button key={m.id} onClick={() => setMethod(m.id)} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: method === m.id ? "#EDF8F2" : "#F9FAFB", border: method === m.id ? "1.5px solid #B7DEC9" : "1.5px solid transparent", textAlign: "left" }}><span style={{ fontSize: 20 }}>{m.icon}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", flex: 1 }}><UiText text={m.label} /></span><span style={{ width: 20, height: 20, borderRadius: 10, border: method === m.id ? "6px solid #0B5E3A" : "2px solid #D1D5DB" }} /></button>)}</div></div>

        <section aria-labelledby="guarantor-heading" className="p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E1EAE4" }}>
          <h3 id="loan-guarantors" style={{ fontWeight: 800, fontSize: 15, color: "#184B32", margin: 0 }}><UiText text={"Two guarantor contacts"} /></h3>
          <p style={{ fontSize: 12, color: "#53635A", marginTop: 8, lineHeight: 1.5 }}><UiText text={"Add two people Kuula may contact if a guarantor is required. This does not make either person liable: Kuula will separately verify their identity and ask for their independent agreement before any guarantee exists."} /></p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {[0, 1].map(index => <div key={index} style={{ padding: 12, border: "1px solid #DFE8E2", borderRadius: 12, background: "#FBFDFC" }}>
              <strong style={{ display: "block", fontSize: 12, color: "#244636", marginBottom: 9 }}><UiText text={`Guarantor ${index + 1}`} /></strong>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 9 }}>
                <label><span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#425149", marginBottom: 5 }}><UiText text={"Full name"} /></span><input id={`loan-guarantor-${index + 1}-name`} className="kx-input" style={{ width: "100%" }} value={businessDetails.guarantors?.[index]?.name ?? ""} onChange={event => setBusinessDetails(current => ({ ...current, guarantors: [0, 1].map(position => position === index ? { name: event.target.value, phone: current.guarantors?.[position]?.phone ?? "" } : current.guarantors?.[position] ?? { name: "", phone: "" }) }))} /></label>
                <label><span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#425149", marginBottom: 5 }}><UiText text={"Phone number"} /></span><input id={`loan-guarantor-${index + 1}-phone`} type="tel" inputMode="tel" placeholder="07XXXXXXXX or +256..." className="kx-input" style={{ width: "100%" }} value={businessDetails.guarantors?.[index]?.phone ?? ""} onChange={event => setBusinessDetails(current => ({ ...current, guarantors: [0, 1].map(position => position === index ? { name: current.guarantors?.[position]?.name ?? "", phone: event.target.value } : current.guarantors?.[position] ?? { name: "", phone: "" }) }))} /></label>
              </div>
            </div>)}
          </div>
        </section>
        <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}>
          <div className="flex justify-between py-1.5"><span><UiText text={"Requested loan amount"} /></span><strong>{formatUGX(amount)}</strong></div>
          <p style={{ fontSize: 12, marginTop: 8 }}><UiText text={"Interest, fees, charges and the final repayment amount will be disclosed in the approved loan offer, before you decide whether to accept it."} /></p>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{ background: "white", borderTop: "1px solid #E8EEEA" }}>{error && <p style={{ fontSize: 11.5, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}><UiText text={error} /></p>}<button disabled={!canApply} onClick={continueToReview} className="kuula-primary" style={{ width: "100%", height: 52, opacity: canApply ? 1 : 0.55, cursor: canApply ? "pointer" : "not-allowed" }}><UiText text={"Review Application"} /></button></div>
    </div>
  );
}
