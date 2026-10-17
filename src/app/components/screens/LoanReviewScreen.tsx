import {getSelectedStatements,clearSelectedStatements,statementDataUrl} from "../../lib/financial-statements";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanQuote, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { localQuote } from "../../lib/pricing";
import { getBusinessPhotos, getBusinessPhotoApplicationId, setBusinessPhotoApplicationId, clearBusinessPhotos, fileToDataUrl } from "../../lib/business-photos";
import { clearSavedLoanApplicationDraft, getSavedLoanApplicationDraft } from "../../lib/loan-application-autosave";
import { formatBusinessLoanPurpose } from "../../lib/business-loan-purpose";
import { getLoanDraft, setLoanDraft, setLastSubmittedApplicationId, type LoanDraft } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

export function LoanReviewScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [draft] = useState<LoanDraft | null>(() => {
    const existingDraft = getLoanDraft();
    if (existingDraft) return existingDraft;
    const saved = state.user ? getSavedLoanApplicationDraft(state.user.id) : null;
    if (
      !saved?.businessDetails
      || !saved?.employmentStatus
      || !saved.occupationOrBusiness.trim()
      || !saved.workDuration
      || !saved.incomeSource
      || !saved.repaymentSource.trim()
      || saved.income <= 0
      || saved.expenses + saved.existingDebt >= saved.income
      || (saved.purpose === "Other" && !saved.otherPurpose.trim())
    ) return null;
    const restoredDraft: LoanDraft = {
      business: {
        ...saved.businessDetails,
        monthlySales: Math.round(saved.income),
        monthlyBusinessExpenses: Math.round(saved.expenses),
        monthlyExistingDebt: Math.round(saved.existingDebt),
      },
      amount: saved.amount,
      termDays: saved.termDays,
      purpose: formatBusinessLoanPurpose(saved.purpose, saved.otherPurpose),
      channel: saved.method,
      employmentStatus: saved.employmentStatus,
      occupationOrBusiness: saved.occupationOrBusiness,
      employerOrBusinessName: saved.employerOrBusinessName,
      workDuration: saved.workDuration,
      incomeSource: saved.incomeSource,
      repaymentSource: saved.repaymentSource,
      declaredMonthlyIncome: saved.income,
      declaredMonthlyExpenses: saved.expenses,
      existingDebtPayment: saved.existingDebt,
    };
    setLoanDraft(restoredDraft);
    return restoredDraft;
  });
  const [agreed, setAgreed] = useState(false);
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(() => getBusinessPhotos().submittedApplicationId ?? getBusinessPhotoApplicationId(state.user?.id ?? ""));
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [submissionStage, setSubmissionStage] = useState<"idle" | "checking" | "creating" | "uploading" | "complete">("idle");
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
    if (!agreed || submittingRef.current || !token || !quote || quoteLoading || quoteError || !state.user) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const { files, consent } = getBusinessPhotos();
      if (!consent || !files.exterior || !files.interior || !files.applicant_at_business) {
        throw new Error("Your required photos or photo consent are missing. Return to the application, take the photographs, and review again.");
      }
      if (!env.USE_API) throw new Error("Submitting a business application requires a live Kuula server connection.");
      setSubmissionStage("checking");
      let applicationId = pendingApplicationId ?? getBusinessPhotoApplicationId(state.user.id);
      if (!applicationId) {
        // If the first POST succeeded but the response was lost, a second
        // submission must not create another loan. Ask the user to resume
        // the existing case instead of guessing which case to attach to.
        const { applications } = await api.getApplications(token);
        const openCase = applications.find(application =>
          ["pending", "resubmitted", "offered", "approved", "disbursing", "active", "overdue"].includes(application.status));
        if (openCase) {
          throw new Error("Kuula already has an open loan application. Open My Applications to track it. Do not submit another request.");
        }
        setSubmissionStage("creating");
        applicationId = (await api.submitApplication(token, draft)).application.id;
        setPendingApplicationId(applicationId);
        setBusinessPhotoApplicationId(applicationId, state.user.id);
      }
      setSubmissionStage("uploading");
      const photos: Record<string, string> = {};
      for (const [kind, file] of Object.entries(files)) {
        if (file) photos[kind] = await fileToDataUrl(file);
      }
      // A prior timeout can mean that private evidence was stored despite
      // the client receiving no response. Query the server before retrying.
      const previous = await api.getBusinessPhotos(token, applicationId);
      const required = ["exterior", "interior", "applicant_at_business"];
      if (!required.every(kind => previous.photos.some(photo => photo.type === kind))) {
        if (previous.photos.length) throw new Error("Some business photos have already been received. Contact Kuula support so the case can be reconciled safely.");
        await api.uploadBusinessPhotos(token, applicationId, photos);
      }
      if (getSelectedStatements().length > 0) {
        const existingStatements = await api.listFinancialStatements(token, applicationId);
        for (const item of getSelectedStatements()) {
          if (!existingStatements.statements.some(saved => saved.kind === item.kind)) {
            await api.uploadFinancialStatement(token, applicationId, {kind:item.kind,periodMonths:item.periodMonths,filename:item.file.name,dataUrl:await statementDataUrl(item.file)});
          }
        }
      }
      setSubmissionStage("complete");
      setLastSubmittedApplicationId(applicationId);
      clearBusinessPhotos(state.user.id);
      clearSelectedStatements();
      clearSavedLoanApplicationDraft(state.user.id);
      setLoanDraft(null);
      onNavigate("loan-approval");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not confirm your application. Your case may already exist; check My Applications before retrying.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setSubmissionStage("idle");
    }
  };

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #EEF2EF" }}><span style={{ fontSize: 13, color: "#68766F" }}>{label}</span><span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: bold ? "#0B5E3A" : "#1F2937", textAlign: "right" }}>{value}</span></div>;
  const canSubmit = Boolean(agreed && !loading && token && quote && !quoteLoading && !quoteError && env.USE_API);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F7FAF8", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #087148)" }}><button onClick={() => onNavigate("loan-apply")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button><div style={{ marginLeft: 12 }}><span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Review Application</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Confirm the exact information sent for underwriting</span></div></div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 140px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#EDF8F2", borderRadius: 16, padding: 16, border: "1px solid #B7DEC9" }}><p style={{ fontSize: 12, color: "#425149", fontWeight: 600, margin: "0 0 4px" }}>REQUESTED AMOUNT</p><p style={{ fontSize: 34, fontWeight: 900, color: "#0B5E3A", margin: 0 }}>{ugx(draft.amount)}</p><p style={{ fontSize: 12, color: "#68766F", margin: "4px 0 0" }}>{draft.termDays}-day term · {draft.purpose} · {draft.channel}</p></div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Business information</p>
          <Row label="Status" value={draft.employmentStatus} />
          <Row label="Occupation / business" value={draft.occupationOrBusiness} />
          <Row label="Employer / business name" value={draft.employerOrBusinessName || "Not provided"} />
          <Row label="Time in current work" value={draft.workDuration} />
          <Row label="Primary income source" value={draft.incomeSource} />
          <Row label="Primary repayment source" value={draft.repaymentSource} />
          <Row label="Sector" value={draft.business.sector} />
          <Row label="Registration status" value={draft.business.tradingAs} />
          <Row label="Registration number" value={draft.business.registrationNumber || "Not registered"} />
          <Row label="District and location" value={draft.business.district + " · " + draft.business.physicalAddress} />
          {draft.business.latitude != null && draft.business.longitude != null && <Row label="Pinned GPS location" value={`${draft.business.latitude.toFixed(6)}, ${draft.business.longitude.toFixed(6)}`} />}
          <Row label="Months trading" value={String(draft.business.tradingMonths)} />
          <Row label="Customers" value={draft.business.customerType} />
          <Row label="Sales frequency" value={draft.business.salesFrequency === "unknown" ? "Not specified" : draft.business.salesFrequency} />
          <Row label="Main suppliers" value={draft.business.primarySuppliers || "Not provided"} />
          <Row label="Supplier payment terms" value={draft.business.supplierPaymentTerms || "Not provided"} />
          <Row label="Seasonality / risks" value={draft.business.seasonalPattern || "Not provided"} />
          <Row label="Low-season monthly sales" value={draft.business.lowSeasonMonthlySales ? ugx(draft.business.lowSeasonMonthlySales) : "Not specified"} />
          <Row label="Typical monthly business sales" value={ugx(draft.business.monthlySales)} />
          <Row label="Monthly operating expenses" value={ugx(draft.business.monthlyBusinessExpenses)} />
          <Row label="Stock purchases" value={ugx(draft.business.inventoryCost)} />
          <Row label="Rent" value={ugx(draft.business.rentCost)} />
          <Row label="Wages" value={ugx(draft.business.wagesCost)} />
          <Row label="Other operating costs" value={ugx(draft.business.otherOperatingCosts)} />
          <Row label="Existing debt repayments" value={ugx(draft.business.monthlyExistingDebt)} />
          <Row label="Other creditors / debts" value={draft.business.otherDebtDetails || "Not provided"} />
          <Row label="Workers" value={String(draft.business.staffCount)} />
          <Row label="Loan use" value={draft.business.loanUse} />
          <Row label="Business repayment plan" value={draft.business.repaymentPlan} />
          <Row label="Preferred repayment frequency" value={draft.business.preferredRepaymentFrequency.replaceAll("_", " ")} />
          <Row label="Planned use · Stock" value={ugx(draft.business.useOfFunds.stock)} />
          <Row label="Planned use · Equipment" value={ugx(draft.business.useOfFunds.equipment)} />
          <Row label="Planned use · Working capital" value={ugx(draft.business.useOfFunds.operations)} />
          <Row label="Planned use · Expansion" value={ugx(draft.business.useOfFunds.expansion)} />
          <Row label="Planned use · Other" value={ugx(draft.business.useOfFunds.other)} />
          <p style={{ fontSize: 11, color: "#68766F", margin: "10px 0 0" }}>Your selected repayment frequency is a preference only. Actual obligations are determined by the final offer and accepted loan agreement.</p>

        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Repayment Disclosure</p>
          {quoteLoading && <p style={{ fontSize: 12, color: "#68766F", margin: "12px 0" }}>Loading Kuula’s current server quote…</p>}
          {quoteError && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", background: "#FEF2F2", borderRadius: 10, padding: 10, margin: "12px 0" }}>{quoteError} Return to the application and try again before submitting.</p>}
          {quote && <><Row label="Principal" value={ugx(quote.principal)} /><Row label={`Interest (${quote.aprPercent}% APR, simple)`} value={ugx(quote.interest)} /><Row label="Service fee" value={ugx(quote.fee)} /><Row label="Total cost of credit" value={ugx(quote.interest + quote.fee)} /><Row label="Total repayment" value={ugx(quote.total)} bold /></>}
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16 }}><p style={{ fontSize: 14, fontWeight: 800, color: "#1F2937", margin: "0 0 4px" }}>Affordability Declaration</p><Row label="Monthly business sales" value={ugx(draft.declaredMonthlyIncome)} /><Row label="Monthly business expenses" value={ugx(draft.declaredMonthlyExpenses)} /><Row label="Existing monthly debt" value={ugx(draft.existingDebtPayment)} /><p style={{ fontSize: 11, color: "#68766F", lineHeight: 1.55, margin: "12px 0 0" }}>These are declarations, not automatic approval. Kuula’s server also requires current KYC, credit evidence and affordability checks, and rechecks eligibility before approval and disbursement.</p></div>

        <div style={{ background: "#EFF6F1", padding: 14, borderRadius: 12, fontSize: 12, color: "#225036" }}>
          <strong>Before submitting</strong>
          <p style={{ margin: "6px 0 0" }}>Your business declarations, applicant position, location, proposed spending, and photo evidence will be reviewed. Submitting does not approve or disburse a loan.</p>
          <p style={{ margin: "6px 0 0" }}>Photos: {getBusinessPhotos().files.exterior ? "Exterior ready" : "Exterior missing"} · {getBusinessPhotos().files.interior ? "Interior ready" : "Interior missing"} · {getBusinessPhotos().files.applicant_at_business ? "Applicant at business ready" : "Applicant photo missing"}</p>
        </div>
        <button disabled={!quote || quoteLoading || Boolean(quoteError)} onClick={() => setAgreed(!agreed)} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: agreed ? "#F0FDF4" : "#FFF", border: `1.5px solid ${agreed ? "#0B5E3A" : "#DDE5E0"}`, borderRadius: 12, padding: "12px 14px", textAlign: "left", opacity: !quote || quoteLoading || quoteError ? .55 : 1 }}><div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${agreed ? "#0B5E3A" : "#D1D5DB"}`, background: agreed ? "#0B5E3A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{agreed && <CheckCircle size={14} color="white" />}</div><p style={{ fontSize: 12, color: "#374151", margin: 0, lineHeight: 1.6 }}>I confirm the application, livelihood and affordability information above is accurate to the best of my knowledge. I understand this is a credit application, not a loan agreement or guarantee of approval.</p></button>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>{error && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error} <button type="button" onClick={() => onNavigate("loan-history")} style={{ textDecoration: "underline", color: "#0B5E3A", border: 0, background: "none" }}>My Applications</button></p>}
        {loading && <p role="status" aria-live="polite" style={{ fontSize: 12, color: "#0B5E3A", textAlign: "center" }}>{submissionStage === "checking" ? "Checking existing applications..." : submissionStage === "creating" ? "Submitting the loan application..." : submissionStage === "uploading" ? "Securely uploading business photographs..." : "Finishing submission..."}</p>}<p style={{ fontSize: 10.5, color: "#89948E", textAlign: "center", marginBottom: 10 }}>Any credit is subject to eligibility, applicable disclosures, customer acceptance and provider-confirmed settlement.</p><button onClick={submit} disabled={!canSubmit} className="kuula-primary" style={{ width: "100%", height: 52, opacity: canSubmit ? 1 : .55 }}>{loading ? "Processing securely..." : quoteLoading ? "Loading quote..." : "Submit application for review"}</button></div>
    </div>
  );
}
