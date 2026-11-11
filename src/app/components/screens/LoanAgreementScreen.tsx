import { UiText, uiLocale } from "../../../i18n/ui-text";
import { ArrowLeft, Download, CheckCircle, Pen, Clock3, AlertTriangle, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError, type LoanApplication, type PaymentFeeDisclosure } from "../../api/client";
import { partnerFinancingApi } from "../../api/partner-financing";
import { getDisbursementStatus, type DisbursementBatchStatus } from "../../api/disbursement";
import { downloadPdf, formatUGX } from "../../lib/export";
import { env } from "../../config/env";
import { getSelectedLoanApplicationId, setSelectedLoanApplicationId } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(uiLocale(), { day: "numeric", month: "long", year: "numeric" });
}

export function LoanAgreementScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const user = state.user;
  const [offer, setOffer] = useState<LoanApplication | null>(null);
  const [offerLoading, setOfferLoading] = useState(true);
  const [paymentFees, setPaymentFees] = useState<PaymentFeeDisclosure | null>(null);
  const [feesReady, setFeesReady] = useState(false);
  const [feesError, setFeesError] = useState("");
  const [charges, setCharges] = useState<Array<{label:string;amount:number}> | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [serverAccepted, setServerAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [signatureName, setSignatureName] = useState(user?.fullName ?? "");
  const [understoodTerms, setUnderstoodTerms] = useState(false);
  const [showAllTerms, setShowAllTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disbursement, setDisbursement] = useState<DisbursementBatchStatus | null>(null);

  useEffect(() => {
    if (!token) {
      setOfferLoading(false);
      return;
    }
    api.getApplications(token).then(async ({ applications }) => {
      const selectedId = getSelectedLoanApplicationId();
      const eligible = (item: LoanApplication) => ["offered", "approved", "disbursing", "active", "overdue", "paid"].includes(item.status);
      const candidate = (selectedId ? applications.find(item => item.id === selectedId && eligible(item)) : null)
        ?? applications.find(item => item.status === "offered")
        ?? applications.find(item => item.status === "disbursing")
        ?? applications.find(eligible)
        ?? null;
      setOffer(candidate);
      setSelectedLoanApplicationId(candidate?.id ?? null);
      setServerAccepted(Boolean(candidate?.agreementAccepted));
      setAcceptedAt(candidate?.agreementAcceptedAt ?? null);
      if (candidate && ["disbursing", "active", "overdue", "paid"].includes(candidate.status)) {
        try {
          const status = await getDisbursementStatus(token, candidate.id);
          setDisbursement(status.disbursement);
        } catch {
          // Polling below will surface persistent provider/reconciliation errors.
        }
      }
    }).catch((e) => setError(e instanceof Error ? e.message : "Could not load your credit offer."))
      .finally(() => setOfferLoading(false));
  }, [token]);

  useEffect(() => {
    if (user?.fullName && !signatureName) setSignatureName(user.fullName);
  }, [user?.fullName, signatureName]);

  useEffect(() => {
    if (!token || !offer || !["offered","approved","disbursing","active","overdue","paid"].includes(offer.status)) return;
    let active=true;
    setCharges(null);setChargeError(null);
    api.getOfferCharges(token,offer.id)
      .then(result=>{if(active)setCharges(result.charges);})
      .catch(err=>{if(active)setChargeError(err instanceof Error?err.message:"Could not verify offer charges");});
    return ()=>{active=false;};
  },[token,offer?.id,offer?.status]);

  useEffect(() => {
    if (!token || !offer) return;
    let active = true;
    setFeesReady(false); setFeesError("");
    api.getPaymentFees(token, offer.id).then(result => { if (active) { setPaymentFees(result.paymentFees); setFeesReady(true); } })
      .catch(error => { if (active) setFeesError(error instanceof Error ? error.message : "Could not verify payment fees"); });
    return () => { active = false; };
  }, [token, offer?.id]);

  useEffect(() => {
    if (!token || !offer || !disbursement) return;
    if (["settled", "failed", "attention_required"].includes(disbursement.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getDisbursementStatus(token, offer.id);
        setDisbursement(status.disbursement);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not refresh settlement status.");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [token, offer?.id, disbursement?.status]);

  const borrower = user?.fullName ?? "—";
  const nin = user?.nationalId ?? "—";
  const agreementNo = offer?.agreementNumber ?? "—";
  const principal = offer?.amount ?? 0;
  const total = offer?.total ?? 0;
  const interest = offer?.interest ?? Math.max(0, total - principal);
  const serviceFee = offer?.serviceFee ?? 0;
  const aprPercent = offer?.apr != null ? Number((offer.apr * 100).toFixed(1)) : null;
  const isPartnerFacility = Boolean(offer?.partnerFinancingRequestId);
  const payee = offer?.payeeName || offer?.partnerLocationName || offer?.partnerName || "the verified partner";

  const clauses = [
    { title: "1. Parties", body: `This agreement is between Kuula Microfinance Limited (the lender) and ${borrower} (the borrower).` },
    { title: "2. Principal", body: `Principal: ${formatUGX(principal)}. Settlement is requested only after this agreement is accepted and all eligibility checks still pass.` },
    { title: "3. Pricing", body: `${aprPercent != null ? `${aprPercent}% nominal annual interest rate` : "The disclosed annual percentage rate"}, using simple interest. Interest shown for this offer: ${formatUGX(interest)}.` },
    { title: "4. Additional charges", body: `Approved charges: ${charges ? (charges.length ? charges.map(item => `${item.label}: ${formatUGX(item.amount)}`).join("; ") : "None") : "Pending verification"}. Total additional charges: ${formatUGX(serviceFee)}.` },
    { title: "5. Total Repayment", body: `Total repayment for this offer: ${formatUGX(total)} over ${offer?.termDays ?? "the disclosed"} days.` },
    {
      title: "6. Disbursement / Settlement",
      body: isPartnerFacility
        ? `This is restricted-purpose credit. Kuula will settle the approved principal directly to ${payee} using the independently verified partner destination linked to invoice/order ${offer?.invoiceReference || "recorded on the application"}. Money is not released as unrestricted cash to the borrower. Kuula may split the approved principal into sequential provider-safe transfers. The loan becomes active only after the full approved principal is provider-confirmed settled to the verified payee.`
        : `Disbursement is requested through ${offer?.channel ?? "the selected mobile-money channel"}. Kuula may split a large approved principal into sequential provider-safe transfers. The loan becomes active only after the disclosed net payout is provider-confirmed settled.`,
    },
    { title: "Customer payment fees", body: !feesReady ? (feesError || "Verifying payment costs") : paymentFees ? `Approved principal: ${formatUGX(principal)}. A fixed Kuula disbursement fee of 3% (${formatUGX(paymentFees.payoutFee)}) is deducted from principal. You receive ${formatUGX(paymentFees.netDisbursement)}. You still owe the agreed principal and contractual repayment. Each loan repayment has a fixed 3% Kuula payment fee added on top, rounded up to whole UGX. For a loan payment of ${formatUGX(total)}, the fee is ${formatUGX(Math.ceil(total * paymentFees.collectionBps / 10000))} and the total phone debit is ${formatUGX(total + Math.ceil(total * paymentFees.collectionBps / 10000))}. Including these fees for one full repayment, the annualised simple total-cost rate on cash received is ${(((total + Math.ceil(total * paymentFees.collectionBps / 10000) - paymentFees.netDisbursement) / paymentFees.netDisbursement) * 365 / (offer?.termDays || 1) * 100).toFixed(2)}%. Paying in parts can change rounding. These are fixed customer fees; MarzPay's actual charges to Kuula are separate and may differ. Only the loan payment, excluding the 3% fee, reduces your loan balance.` : "Payment provider costs are paid by Kuula under this existing agreement; the principal is paid in full." },
    { title: "7. Repayment and due date", body: `The total contractual repayment is ${formatUGX(total)} for a term of ${offer?.termDays ?? "the agreed"} days. Kuula must provide the actual due date and any installment schedule in the confirmed loan record following settlement. Only provider-confirmed payments reduce the balance; partial payments may be made up to the outstanding amount. Request a copy of your current schedule from Kuula before making a repayment.` },
    { title: "8. Late payment and lawful recovery", body: "If repayment is overdue, Kuula may send payment reminders, request repayment and pursue recovery only through procedures permitted under Ugandan law. Any additional default charge must have been lawfully disclosed and agreed; this agreement does not authorize undisclosed charges, compounding of penalties, harassment, threats or unlawful seizure of property." },
    { title: "9. Early repayment", body: "You may request early settlement. Kuula must provide an itemized outstanding balance and apply any legally required reduction or adjustment. No undisclosed early-settlement fee is created by this clause." },
    { title: "10. Guarantees and security", body: "A guarantee or security applies only where separately documented, verified and validly accepted. No guarantee or collateral is created merely by accepting this loan agreement. Kuula must provide the relevant separate instrument when applicable." },
    { title: "11. Complaints and disputes", body: "For a billing or loan-servicing dispute, contact Kuula through its in-app Support channel and retain the agreement number. Kuula will review the issue and explain available escalation mechanisms. Nothing in this agreement removes any statutory consumer rights or lawful access to competent Ugandan authorities or courts." },
    { title: "12. Data & Credit", body: "Kuula may use verified identity, repayment and permitted credit evidence for underwriting, servicing, fraud prevention and lawful reporting according to the applicable privacy notice and agreements." },
  ];

  const acceptAgreement = async () => {
    if (!token || !offer || busy) return;
    if (!charges || chargeError || !feesReady || feesError) { setError("Approved pricing details must load before you can accept the loan."); return; }
    const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!understoodTerms || !signatureName.trim() || normalizeName(signatureName) !== normalizeName(borrower)) {
      setError("Please confirm that you understand the agreement and type your registered name to sign.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = await api.acceptLoanAgreement(token, offer.id, {
        paymentFeePolicy: paymentFees?.policyVersion ?? null,
        netDisbursement: paymentFees?.netDisbursement ?? principal,
        payoutFee: paymentFees?.payoutFee ?? 0,
        appVersion: env.APP_VERSION,
        signatureVersion: "typed_name_v1",
        signedByName: signatureName.trim().replace(/\s+/g, " "),
        explicitConsent: understoodTerms,
        platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : "unknown",
        disbursementMode: isPartnerFacility ? "direct_payee" : "customer_mobile_money",
        partnerFinancingRequestId: offer.partnerFinancingRequestId ?? null,
      });
      setServerAccepted(true);
      setAcceptedAt(result.acceptedAt);

    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record your agreement acceptance.");
    } finally {
      setBusy(false);
    }
  };

  const requestDisbursement = async () => {
    if (!token || !offer || !serverAccepted || busy) return;
    setBusy(true); setError(null);
    try {
      if (isPartnerFacility) {
        if (!offer.partnerFinancingRequestId) throw new Error("Partner financing reference is missing.");
        await partnerFinancingApi.accept(token, offer.partnerFinancingRequestId);
      } else {
        await api.acceptLoan(token, offer.id);
      }
      const status = await getDisbursementStatus(token, offer.id);
      setDisbursement(status.disbursement);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start settlement.");
    } finally {
      setBusy(false);
    }
  };

  const downloadAgreement = () => downloadPdf({
    title: isPartnerFacility ? "Restricted-Purpose Credit Agreement" : "Loan Agreement",
    subtitle: `Agreement No: ${agreementNo}`,
    meta: [
      { label: "Lender", value: "Kuula Microfinance Limited" },
      { label: "Borrower", value: borrower },
      { label: "National ID", value: nin },
      { label: "Principal", value: formatUGX(principal) },
      { label: "Total Repayment", value: formatUGX(total) },
      ...(isPartnerFacility ? [{ label: "Verified Payee", value: payee }, { label: "Invoice / Order", value: offer?.invoiceReference || "Recorded in application" }] : []),
      { label: "Status", value: serverAccepted ? `Accepted ${fmtDate(acceptedAt)}` : "Draft — not yet accepted" },
      { label: "Terms version", value: "kuula-agreement-2026-11-11" },

    ],
    tables: [{ title: "Terms", head: ["Clause", "Detail"], rows: clauses.map((c) => [c.title, c.body]) }],
    filename: `kuula-credit-agreement-${agreementNo}.pdf`,
  });

  const disbursementTerminal = disbursement && ["settled", "failed", "attention_required"].includes(disbursement.status);
  const beneficiaryLabel = isPartnerFacility ? payee : "your Mobile Money";

  return (
    <div role="main" aria-label="Full-screen loan agreement" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", flexDirection: "column", width: "100vw", height: "100dvh", background: "#F8F9F7", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px clamp(16px, 3vw, 48px)", background: "#0B5E3A", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("loan-history")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}><UiText text={disbursement ? (isPartnerFacility ? "Partner Settlement Progress" : "Disbursement Progress") : "Credit Agreement"} /></span>
        </div>
        <button onClick={downloadAgreement} disabled={!offer || !charges || !feesReady || !!feesError || !!chargeError} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 12, fontWeight: 600, opacity: offer ? 1 : .55 }}><Download size={14} /><UiText text={" PDF"} /></button>
      </div>

      <div style={{ flexShrink: 0, background: serverAccepted ? "#EDF8F2" : "#FFF9E5", padding: "10px 16px", borderBottom: `1px solid ${serverAccepted ? "#B7DEC9" : "#F2D77B"}`, display: "flex", alignItems: "center", gap: 8 }}>
        {serverAccepted ? <><CheckCircle size={16} color="#0B5E3A" /><span style={{ fontSize: 12, color: "#0B5E3A", fontWeight: 700 }}><UiText text={"Agreement acceptance securely recorded"} /></span></> : <><Pen size={16} color="#9B7410" /><span style={{ fontSize: 12, color: "#665218", fontWeight: 700 }}><UiText text={"Review and accept the exact offer before settlement"} /></span></>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px clamp(12px, 3vw, 48px) 40px" }}>
        {offerLoading ? <div role="status" style={{ maxWidth: 800, margin: "0 auto", padding: 28, textAlign: "center", color: "#52645A" }}>Loading your offer…</div>
          : !offer ? <div style={{ maxWidth: 720, margin: "0 auto", padding: 28, background: "white", borderRadius: 14, textAlign: "center", boxShadow: "0 12px 35px rgba(48,45,34,.10)" }}>
            <h2 style={{ marginTop: 0, color: "#173B2A" }}>No approved offer to review</h2>
            <p style={{ color: "#52645A", lineHeight: 1.6 }}>{error || "When an offer is ready, it will appear under My Loans → Offers to review."}</p>
            <button type="button" onClick={() => onNavigate("loan-history")} style={{ border: 0, borderRadius: 9, background: "#0B5E3A", color: "white", padding: "11px 16px", fontWeight: 700 }}>Go to My Loans</button>
          </div>
          : <>
        {isPartnerFacility && !disbursement && (
          <div style={{ display: "flex", gap: 10, padding: 14, marginBottom: 14, borderRadius: 14, background: "#FFF7D8", border: "1px solid #EFE0A4" }}>
            <Building2 size={20} color="#7B6418" style={{ flexShrink: 0 }} />
            <div><strong style={{ fontSize: 12, color: "#63551F" }}><UiText text={"Direct to verified payee"} /></strong><div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.5, color: "#75672F" }}>{payee}<UiText text={offer?.invoiceReference ? ` · ${offer.invoiceReference}` : ""} /><UiText text={". You repay Kuula under this agreement after Kuula confirms full provider settlement."} /></div></div>
          </div>
        )}

        {disbursement && (
          <div style={{ background: "white", borderRadius: 16, padding: 18, marginBottom: 16, border: "1px solid #DDE9E2" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              {disbursement.status === "settled" ? <CheckCircle size={22} color="#0B5E3A" /> : disbursementTerminal ? <AlertTriangle size={22} color="#B45309" /> : <Clock3 size={22} color="#0B5E3A" />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#13251C" }}>{disbursement.status === "settled" ? `Disclosed payout settled to ${beneficiaryLabel}` : disbursementTerminal ? "Kuula review required" : disbursement.status === "awaiting_release" ? "Approved · awaiting Kuula's final payment authorization" : `Settling approved credit to ${beneficiaryLabel}`}</div>
                <div style={{ fontSize: 11, color: "#718078", marginTop: 2 }}>{disbursement.network.toUpperCase()}<UiText text={" Mobile Money · "} />{disbursement.legs.length}<UiText text={" transfer"} /><UiText text={disbursement.legs.length === 1 ? "" : "s"} /></div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 12, color: "#68766F" }}><UiText text={"Provider-confirmed"} /></span><strong style={{ fontSize: 13, color: "#0B5E3A" }}>{formatUGX(disbursement.totalSettled)} / {formatUGX(disbursement.netDisbursement ?? disbursement.approvedAmount)}</strong></div>
            <div style={{ height: 8, borderRadius: 8, background: "#E8EFEB", overflow: "hidden", marginBottom: 14 }}><div style={{ width: `${Math.min(100, (disbursement.totalSettled / Math.max(1, disbursement.netDisbursement ?? disbursement.approvedAmount)) * 100)}%`, height: "100%", background: "#0B5E3A" }} /></div>
            <div style={{ display: "grid", gap: 8 }}>
              {disbursement.legs.map((leg) => <div key={leg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "#F7FAF8" }}><div><div style={{ fontSize: 12, fontWeight: 700, color: "#263A30" }}><UiText text={"Transfer "} />{leg.sequence}</div><div style={{ fontSize: 10, color: "#809087", marginTop: 2 }}>{leg.status.replace(/_/g, " ")}</div></div><strong style={{ fontSize: 12, color: leg.status === "settled" ? "#0B5E3A" : "#4B5C53" }}>{formatUGX(leg.amount)}</strong></div>)}
            </div>
            {disbursement.status !== "settled" && <p style={{ fontSize: 11, color: "#718078", lineHeight: 1.5, margin: "12px 0 0" }}><UiText text={"Kuula sends only one transfer at a time. The next transfer starts only after the previous one is confirmed by the payment provider."} /></p>}
          </div>
        )}

        <div style={{ maxWidth: 1480, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "clamp(18px, 3vw, 48px)", background: "#FFFEFA", border: "1px solid #E2DDCE", borderRadius: 4, boxShadow: "0 14px 40px rgba(48,45,34,.14)", color: "#27352C" }}>
          <div style={{ textAlign: "center", borderBottom: "1px solid #C9C1AD", paddingBottom: 20 }}>
            <p style={{ fontSize: 11, letterSpacing: 2, color: "#657267", margin: "0 0 8px" }}>KUULA MICROFINANCE LIMITED</p>
            <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 700, letterSpacing: .5, color: "#173B2A", margin: "0 0 8px" }}><UiText text={isPartnerFacility ? "RESTRICTED-PURPOSE CREDIT AGREEMENT" : "LOAN AGREEMENT"} /></h2>
            <p style={{ fontSize: 11, color: "#657267", margin: 0 }}><UiText text={"Agreement No: "} />{agreementNo}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, margin: "20px 0" }} aria-label="Offer summary">
            {[
              ["Approved principal", formatUGX(principal)],
              ["Net amount to receive", paymentFees ? formatUGX(paymentFees.netDisbursement) : formatUGX(principal)],
              ["Total repayment", formatUGX(total)],
              ["Term", `${offer.termDays} days`],
              ["Annual interest rate", `${aprPercent ?? "—"}%`],
            ].map(([label, value]) => <div key={label} style={{ padding: 13, background: "#F3F1E9", border: "1px solid #E3DECF", borderRadius: 7 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: .7, color: "#69766C", fontWeight: 700 }}>{label}</div>
              <div style={{ marginTop: 5, fontSize: 15, fontWeight: 800, color: "#173B2A" }}>{value}</div>
            </div>)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0 12px" }}>
            <strong style={{ fontSize: 14, color: "#173B2A" }}>Agreement terms and borrower protections</strong>
            <button type="button" onClick={() => setShowAllTerms(v => !v)} aria-expanded={showAllTerms} style={{ border: "1px solid #C9D8D0", background: "white", borderRadius: 8, color: "#0B5E3A", padding: "8px 12px", fontWeight: 700 }}>{showAllTerms ? "Collapse terms" : "Expand terms"}</button>
          </div>
          {showAllTerms && <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {clauses.map(({ title, body }) => <section key={title} style={{ padding: "17px 3px", borderBottom: "1px solid #E9E5DA" }}>
              <h3 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 16, color: "#173B2A", margin: "0 0 7px" }}>{title}</h3>
              <p style={{ fontSize: 13, color: "#46564B", margin: 0, lineHeight: 1.8, whiteSpace: "pre-line" }}>{body}</p>
            </section>)}
          </div>}
          {!serverAccepted && <div style={{ padding: 14, borderRadius: 12, background: "#F3F9F5", border: "1px solid #CDE2D5" }}>
            <strong style={{ fontSize: 13, color: "#1C4A31" }}><UiText text={"Sign your exact loan offer"} /></strong>
            <p style={{ color: "#50645B", fontSize: 12 }}><UiText text={"Your typed name and consent will be attached to the server-recorded agreement. Signing does not disburse money; an independent Kuula staff release is still required."} /></p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700 }}><UiText text={"Registered full name "} /><input type="text" autoComplete="name" value={signatureName} onChange={event => setSignatureName(event.target.value)}
                placeholder={borrower} style={{ display: "block", width: "100%", marginTop: 6, padding: 12, border: "1px solid #D1E4D8", borderRadius: 8 }} />
            </label>
            <p style={{ fontSize: 11, color: signatureName.trim() && signatureName.trim().replace(/\s+/g, " ").toLowerCase() !== borrower.trim().replace(/\s+/g, " ").toLowerCase() ? "#B42318" : "#52645A", margin: "6px 0 0" }}>
              {signatureName.trim() && signatureName.trim().replace(/\s+/g, " ").toLowerCase() !== borrower.trim().replace(/\s+/g, " ").toLowerCase()
                ? "The signature must match the registered name shown above."
                : "Your name is prefilled for convenience. Review every term and actively confirm your consent below."}
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, fontSize: 12 }}>
              <input type="checkbox" checked={understoodTerms} onChange={event => setUnderstoodTerms(event.target.checked)} /><UiText text={" I have reviewed the principal, interest, repayment period, payment fees, repayment obligations, and default/dispute information. I voluntarily accept this offer and sign electronically. "} /></label>
          </div>}
          <div style={{fontSize:12,color:"#374151",padding:12,background:"#F0FDF4",borderRadius:10}}>
            <strong><UiText text={"Additional approved charges: "} />{formatUGX(serviceFee)}</strong>
            {charges ? (charges.length ? charges.map((charge,i)=><p key={i}><UiText text={charge.label} />: {formatUGX(charge.amount)}</p>) : <p><UiText text={"No additional charges."} /></p>) : <p>{chargeError || "Verifying final fees..."}</p>}
          </div>
          {serverAccepted && <div style={{ border: "2px solid #0B5E3A", borderRadius: 12, padding: 16, background: "#EDF8F2" }}><p style={{ fontSize: 13, fontWeight: 700, color: "#0B5E3A", margin: "0 0 4px" }}><UiText text={"Server-recorded Acceptance"} /></p><p style={{ fontSize: 15, color: "#1F2937", margin: "0 0 4px", fontWeight: 700 }}>{borrower}</p><p style={{ fontSize: 11, color: "#0B5E3A", margin: 0 }}><UiText text={"Accepted "} />{fmtDate(acceptedAt)}<UiText text={" · App "} />{env.APP_VERSION}</p></div>}
        </div>
        </>}
      </div>

      <div style={{ flexShrink: 0, padding: "12px clamp(16px, 3vw, 48px) max(16px, env(safe-area-inset-bottom))", background: "white", borderTop: "1px solid #E8EEEA", boxShadow: "0 -3px 20px rgba(0,0,0,.04)" }}>
        {error && <p style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 10px", textAlign: "center" }}><UiText text={error} /></p>}
        {!offerLoading && offer && !serverAccepted && !error && (
          <p style={{ fontSize: 11, color: feesError || chargeError ? "#B42318" : "#657267", margin: "0 0 8px", textAlign: "center" }}>
            {feesError ? `Unable to verify payment fees: ${feesError}`
              : chargeError ? `Unable to verify approved charges: ${chargeError}`
                : !feesReady || !charges ? "Verifying approved charges and payment fees…"
                  : !signatureName.trim() || signatureName.trim().replace(/\s+/g, " ").toLowerCase() !== borrower.trim().replace(/\s+/g, " ").toLowerCase() ? "Enter the registered borrower name exactly as shown in the agreement."
                    : !understoodTerms ? "Read the agreement and check the consent box to enable acceptance."
                      : ""}
          </p>
        )}
        {offerLoading ? <button disabled style={{ width: "100%", height: 52, borderRadius: 14, border: 0 }}><UiText text={"Loading offer…"} /></button> : !offer ? (
          <button onClick={() => onNavigate("loan-history")} className="kuula-primary" style={{ width: "100%", height: 52 }}>Go to My Loans</button>
        ) : disbursement ? (
          <button onClick={() => onNavigate(disbursement.status === "settled" ? "loan-detail" : "home")} className="kuula-primary" style={{ width: "100%", height: 52 }}><UiText text={disbursement.status === "settled" ? "View Active Loan" : "Return Home"} /></button>
        ) : !serverAccepted ? (
          <>
            <button onClick={acceptAgreement} disabled={busy || !feesReady || !!feesError || !charges || !!chargeError || !understoodTerms || signatureName.trim().replace(/\s+/g, " ").toLowerCase() !== borrower.trim().replace(/\s+/g, " ").toLowerCase()} className="kuula-primary" style={{ width: "100%", height: 52 }}><UiText text={busy ? "Recording acceptance…" : "Accept Credit Agreement"} /></button>
            <p style={{ textAlign: "center", color: "#657267", fontSize: 10, margin: "5px 0 0" }}>Accepting records your signature. You will then confirm the payout request as a separate step.</p>
          </>
        ) : (
          <>
            <button onClick={requestDisbursement} disabled={busy} className="kuula-primary" style={{ width: "100%", height: 52 }}><UiText text={busy ? "Starting secure settlement…" : isPartnerFacility ? `Pay ${payee}` : "Continue: Request Disbursement"} /></button>
            <p style={{ textAlign: "center", color: "#657267", fontSize: 10, margin: "5px 0 0" }}>Agreement accepted. A Kuula staff member must authorize payment separately.</p>
          </>
        )}
      </div>
    </div>
  );
}
