import { ArrowLeft, Download, CheckCircle, Pen } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError, type LoanApplication } from "../../api/client";
import { downloadPdf, formatUGX } from "../../lib/export";
import { env } from "../../config/env";

interface Props { onNavigate: (s: string) => void; }
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });
}

export function LoanAgreementScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const user = state.user;
  const [offer, setOffer] = useState<LoanApplication | null>(null);
  const [serverAccepted, setServerAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getApplications(token).then(({ applications }) => {
      const candidate = applications.find((item) => item.status === "offered") ?? applications[0] ?? null;
      setOffer(candidate);
    }).catch((e) => setError(e instanceof Error ? e.message : "Could not load your loan offer."));
  }, [token]);

  const borrower = user?.fullName ?? "—";
  const nin = user?.nationalId ?? "—";
  const agreementNo = offer?.id ?? "—";
  const principal = offer?.amount ?? 0;
  const total = offer?.total ?? 0;
  const interest = offer?.interest ?? Math.max(0, total - principal);
  const aprPercent = offer?.apr != null ? Number((offer.apr * 100).toFixed(1)) : null;

  const clauses = [
    { title: "1. Parties", body: `This agreement is between Kuula Microfinance Limited (the lender) and ${borrower} (the borrower).` },
    { title: "2. Principal", body: `Principal: ${formatUGX(principal)}. Funds are requested only after this agreement is accepted and all eligibility checks still pass.` },
    { title: "3. Pricing", body: `${aprPercent != null ? `${aprPercent}% annual percentage rate` : "The disclosed annual percentage rate"}, using simple interest. Interest shown for this offer: ${formatUGX(interest)}. No savings discount is applied.` },
    { title: "4. Total Repayment", body: `Total repayment for this offer: ${formatUGX(total)} over ${offer?.termDays ?? "the disclosed"} days.` },
    { title: "5. Disbursement", body: `Disbursement is requested through ${offer?.channel ?? "the selected mobile-money channel"}. A loan becomes active only after the payment provider confirms settlement.` },
    { title: "6. Repayment", body: "Repayments change the loan balance only after the payment provider confirms collection. Partial payments are permitted up to the outstanding balance." },
    { title: "7. Data & Credit", body: "Kuula may use verified identity, repayment and permitted credit evidence for underwriting, servicing, fraud prevention and lawful reporting according to the applicable privacy notice and agreements." },
  ];

  const acceptAgreement = async () => {
    if (!token || !offer || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await api.acceptLoanAgreement(token, offer.id, {
        appVersion: env.APP_VERSION,
        platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : "unknown",
      });
      setServerAccepted(true);
      setAcceptedAt(result.acceptedAt);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not record your agreement acceptance."); }
    finally { setBusy(false); }
  };

  const requestDisbursement = async () => {
    if (!token || !offer || !serverAccepted || busy) return;
    setBusy(true); setError(null);
    try {
      await api.acceptLoan(token, offer.id);
      onNavigate("loan-approval");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not request disbursement."); }
    finally { setBusy(false); }
  };

  const downloadAgreement = () => downloadPdf({
    title: "Loan Agreement",
    subtitle: `Agreement No: ${agreementNo}`,
    meta: [
      { label: "Lender", value: "Kuula Microfinance Limited" },
      { label: "Borrower", value: borrower },
      { label: "National ID", value: nin },
      { label: "Principal", value: formatUGX(principal) },
      { label: "Total Repayment", value: formatUGX(total) },
      { label: "Status", value: serverAccepted ? `Accepted ${fmtDate(acceptedAt)}` : "Not yet accepted" },
    ],
    tables: [{ title: "Terms", head: ["Clause", "Detail"], rows: clauses.map((c) => [c.title, c.body]) }],
    filename: `kuula-loan-agreement-${agreementNo}.pdf`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F7FAF8" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Loan Agreement</span>
        </div>
        <button onClick={downloadAgreement} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 12, fontWeight: 600 }}><Download size={14} /> PDF</button>
      </div>

      <div style={{ background: serverAccepted ? "#EDF8F2" : "#FFF9E5", padding: "10px 16px", borderBottom: `1px solid ${serverAccepted ? "#B7DEC9" : "#F2D77B"}`, display: "flex", alignItems: "center", gap: 8 }}>
        {serverAccepted ? <><CheckCircle size={16} color="#0B5E3A" /><span style={{ fontSize: 12, color: "#0B5E3A", fontWeight: 700 }}>Acceptance securely recorded · {fmtDate(acceptedAt)}</span></> : <><Pen size={16} color="#9B7410" /><span style={{ fontSize: 12, color: "#665218", fontWeight: 700 }}>Review and accept the exact offer before requesting funds</span></>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 150px" }}>
        <div style={{ background: "white", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ textAlign: "center", borderBottom: "2px solid #EEF2EF", paddingBottom: 16 }}><p style={{ fontSize: 11, color: "#89948E", margin: 0 }}>KUULA MICROFINANCE LIMITED</p><h2 style={{ fontSize: 18, fontWeight: 800, color: "#13251C", margin: "4px 0" }}>LOAN AGREEMENT</h2><p style={{ fontSize: 11, color: "#89948E", margin: 0 }}>Agreement No: {agreementNo}</p></div>
          {clauses.map(({ title, body }) => <div key={title}><p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>{title}</p><p style={{ fontSize: 12, color: "#68766F", margin: 0, lineHeight: 1.7 }}>{body}</p></div>)}
          {serverAccepted && <div style={{ border: "2px solid #0B5E3A", borderRadius: 12, padding: 16, background: "#EDF8F2" }}><p style={{ fontSize: 13, fontWeight: 700, color: "#0B5E3A", margin: "0 0 4px" }}>Server-recorded Acceptance</p><p style={{ fontSize: 15, color: "#1F2937", margin: "0 0 4px", fontWeight: 700 }}>{borrower}</p><p style={{ fontSize: 11, color: "#0B5E3A", margin: 0 }}>Accepted {fmtDate(acceptedAt)} · App {env.APP_VERSION}</p></div>}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>
        {error && <p style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 10px", textAlign: "center" }}>{error}</p>}
        {!offer ? <button disabled style={{ width: "100%", height: 52, borderRadius: 14, border: 0 }}>Loading offer…</button> : !serverAccepted ? (
          <button onClick={acceptAgreement} disabled={busy} className="kuula-primary" style={{ width: "100%", height: 52 }}>{busy ? "Recording acceptance…" : "Accept Loan Agreement"}</button>
        ) : (
          <button onClick={requestDisbursement} disabled={busy} className="kuula-primary" style={{ width: "100%", height: 52 }}>{busy ? "Requesting disbursement…" : "Request Mobile-Money Disbursement"}</button>
        )}
      </div>
    </div>
  );
}
