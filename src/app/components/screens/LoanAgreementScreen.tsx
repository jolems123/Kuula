import { ArrowLeft, Download, CheckCircle, Pen } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { downloadPdf, formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function LoanAgreementScreen({ onNavigate }: Props) {
  const [signed, setSigned] = useState(false);
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;

  const user = state.user;
  const activeLoan = state.loan?.activeLoan ?? null;
  const [total, setTotal] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);

  // The borrower may reach this screen with a pending OFFER (admin approved but
  // funds not yet released). Fetch their latest application so we know whether to
  // show "Accept & Receive Funds" — accepting is the ONLY step that releases the
  // real MarzPay payout.
  const [offer, setOffer] = useState<LoanApplication | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getRepayment(token).then(({ repayment }) => {
      if (!repayment) return;
      setTotal(Number(repayment.total ?? 0));
      setDueDate(repayment.due_date ? String(repayment.due_date) : null);
    }).catch(() => {});
    api.getApplications(token).then(({ applications }) => {
      if (applications.length) setOffer(applications[0]); // newest first
    }).catch(() => {});
  }, [token]);

  const isOffer = offer?.status === "offered";

  const handleAccept = async () => {
    if (!token || !offer) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await api.acceptLoan(token, offer.id);
      onNavigate("loan-approval");
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "We couldn't process your acceptance. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const borrower = user?.fullName ?? "—";
  const nin = user?.nationalId ?? "—";
  const phone = user?.phone ?? "—";
  const agreementNo = activeLoan?.id ?? offer?.id ?? "—";
  const principal = activeLoan?.amount ?? offer?.amount ?? 0;
  const effectiveTotal = total ?? (offer && offer.total > 0 ? offer.total : null);
  const signedDate = new Date();

  const clauses: { title: string; body: string }[] = [
    { title: "1. Parties", body: `This agreement is entered into between Kuula Microfinance Limited ("Lender") and ${borrower} (NIN: ${nin}) ("Borrower").` },
    { title: "2. Loan Amount", body: `The Lender agrees to disburse ${formatUGX(principal)} to the Borrower upon signing of this agreement.` },
    { title: "3. Interest Rate", body: "The loan attracts simple interest at an all-inclusive Annual Percentage Rate (APR) not exceeding 33.6% — the maximum permitted under Uganda's UMRA money-lending regulations. Interest is never compounded." },
    { title: "4. Service Fee", body: "No separate service fee is deducted. The Borrower receives the full principal; the APR above is all-inclusive." },
    { title: "5. Repayment", body: `The total repayment amount of ${effectiveTotal != null ? formatUGX(effectiveTotal) : "the agreed sum"} shall be due and payable by ${dueDate ? fmtDate(dueDate) : `${offer?.termDays ?? 30} days after disbursement`} via mobile money (${phone}).` },
    { title: "6. Default", body: "A late payment may attract a one-time fee within UMRA limits and may affect the Borrower's credit score. Penalties are never compounded, and total charges always remain within the 33.6% APR ceiling." },
    { title: "7. Data & Privacy", body: "The Borrower consents to Kuula sharing repayment data with Uganda credit reference bureaus as required by UMRA regulations." },
  ];

  const downloadAgreement = () => {
    downloadPdf({
      title: "Loan Agreement",
      subtitle: `Agreement No: ${agreementNo}`,
      meta: [
        { label: "Lender", value: "Kuula Microfinance Limited" },
        { label: "Borrower", value: borrower },
        { label: "National ID", value: nin },
        { label: "Principal", value: formatUGX(principal) },
        { label: "Total Repayment", value: effectiveTotal != null ? formatUGX(effectiveTotal) : "—" },
        { label: "Due Date", value: fmtDate(dueDate) },
        { label: "Status", value: signed ? `Signed by ${borrower} on ${fmtDate(signedDate.toISOString())}` : "Unsigned" },
      ],
      tables: [{ title: "Terms", head: ["Clause", "Detail"], rows: clauses.map((c) => [c.title, c.body]) }],
      filename: `kuula-loan-agreement-${agreementNo}.pdf`,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Loan Agreement</span>
        </div>
        <button onClick={downloadAgreement} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}>
          <Download size={14} /> PDF
        </button>
      </div>

      {/* Agreement status banner */}
      <div style={{ background: signed ? "#F0FDF4" : "#FFF7ED", padding: "10px 16px", borderBottom: `1px solid ${signed ? "#A7F3D0" : "#FED7AA"}`, display: "flex", alignItems: "center", gap: 8 }}>
        {signed
          ? <><CheckCircle size={16} color="#10B981" /><span style={{ fontSize: 12, color: "#065F46", fontWeight: 600 }}>Digitally signed by {borrower} · {fmtDate(signedDate.toISOString())}</span></>
          : <><Pen size={16} color="#D97706" /><span style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>Requires your e-signature below</span></>
        }
      </div>

      {/* Document body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px" }}>
        <div style={{ background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ textAlign: "center", borderBottom: "2px solid #F3F4F6", paddingBottom: 16 }}>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>KUULA MICROFINANCE LIMITED</p>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1F2937", margin: "4px 0" }}>LOAN AGREEMENT</h2>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Agreement No: {agreementNo}</p>
          </div>

          {clauses.map(({ title, body }) => (
            <div key={title}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>{title}</p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.7 }}>{body}</p>
            </div>
          ))}

          {/* Signature box */}
          {!signed && (
            <div style={{ border: "2px dashed #D1D5DB", borderRadius: 12, padding: "20px", textAlign: "center", marginTop: 8 }}>
              <Pen size={24} color="#9CA3AF" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Tap "Sign Agreement" below to add your e-signature</p>
            </div>
          )}

          {signed && (
            <div style={{ border: "2px solid #10B981", borderRadius: 12, padding: "16px", background: "#F0FDF4" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#065F46", margin: "0 0 4px" }}>Digitally Signed</p>
              <p style={{ fontSize: 24, fontFamily: "cursive", color: "#1F2937", margin: "0 0 4px" }}>{borrower}</p>
              <p style={{ fontSize: 11, color: "#10B981", margin: 0 }}>Signed {fmtDate(signedDate.toISOString())} · Kuula App v2.4.1</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {acceptError && (
          <p style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 10px", textAlign: "center" }}>{acceptError}</p>
        )}
        {isOffer && signed ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{ width: "100%", height: 52, borderRadius: 14, background: accepting ? "#A78BFA" : "linear-gradient(135deg, #7C3AED, #5B21B6)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: accepting ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {accepting ? "Processing your loan…" : <><CheckCircle size={18} /> Accept &amp; Receive Funds</>}
          </button>
        ) : (
          <button
            onClick={() => setSigned(true)}
            style={{ width: "100%", height: 52, borderRadius: 14, background: signed ? "#F3F4F6" : "linear-gradient(135deg, #FF6B35, #E05A2B)", color: signed ? "#6B7280" : "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {signed ? <><CheckCircle size={18} color="#10B981" /> Agreement Signed</> : <><Pen size={18} /> {isOffer ? "Sign to Continue" : "Sign Agreement"}</>}
          </button>
        )}
      </div>
    </div>
  );
}
