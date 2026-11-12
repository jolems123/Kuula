import { ListSearch } from "../ListSearch";
import { GuarantorStaffReview } from "../GuarantorStaffReview";
/**
 * Admin Loan Management Screens
 * A3.1 LoanAppsList | A3.2 LoanAppDetail | A3.3 LoanApproval | A3.4 LoanRejection
 * A3.5 ActiveLoansList | A3.6 ActiveLoanDetail | A3.7 RepaymentTracking
 * A3.8 OverdueLoansList | A3.9 OverdueLoanDetail | A3.10 LoanHistoryAll
 */

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, MessageSquare, Phone, Download } from "lucide-react";
import { downloadCsv } from "../../lib/export";
import { ExportToolbar } from "../ExportToolbar";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { getDisbursementStatus, type DisbursementBatchStatus } from "../../api/disbursement";
import { setCreditOperationsSelection } from "../../lib/selection";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BusinessPhotoReview({ token, applicationId }: { token: string; applicationId: string }) {
  const [photos, setPhotos] = useState<Array<{ id: string; type: string; bytes: number }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.getBusinessPhotos(token, applicationId).then(result => {
      if (active) setPhotos(result.photos);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load business photo evidence"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, applicationId]);
  const open = async (photoId: string) => {
    try {
      const response = await api.accessBusinessPhoto(token, applicationId, photoId);
      window.open(response.url, "_blank", "noopener,noreferrer");
      if (response.temporary) window.setTimeout(() => URL.revokeObjectURL(response.url), 60_000);
    } catch(err) { setError(err instanceof Error ? err.message : "Could not open private photo"); }
  };
  const recommendedTypes = ["exterior", "interior", "applicant_at_business"];
  const missing = recommendedTypes.filter(kind => !photos.some(photo => photo.type === kind));
  return <div style={{ border: "1px solid #D6E4DC", borderRadius: 12, padding: 14, marginTop: 14 }}>
    <strong style={{ fontSize: 14 }}>Applicant business photographs</strong>
    <p style={{ color: "#64748B", fontSize: 12 }}>Compare premises, applicant identity and other evidence. Images alone do not establish authenticity.</p>
    {loading ? <p style={{ fontSize: 12 }}>Loading private evidence...</p> : <>
      <p style={{ color: missing.length ? "#B45309" : "#0B5E3A", fontSize: 12 }}>
        {!photos.length ? "No optional business photos provided" : missing.length ? "Optional photos not provided: " + missing.join(", ") : "Photos received — authenticity still requires review"}
      </p>
      {photos.map(photo => <button key={photo.id} type="button" onClick={() => void open(photo.id)}
        style={{ padding: 10, marginRight: 8, marginBottom: 8, background: "white", border: "1px solid #C9DCD0", borderRadius: 9 }}>
        {photo.type.replaceAll("_", " ")} · {Math.round(photo.bytes / 1024)} KB · View privately
      </button>)}
    </>}
    {error && <p role="alert" style={{ color: "#B91C1C", fontSize: 12 }}>{error}</p>}
  </div>;
}
// A3.1
export function AdminLoanAppsListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  const canAssignOfficer = ["super_admin", "administrator", "admin", "credit_manager", "manager", "final_approver"].includes(state.role || "");
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [applicationSearch, setApplicationSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<DisbursementBatchStatus | null>(null);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);
  const [paymentStatusError, setPaymentStatusError] = useState("");

  const refresh = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { applications } = await api.getApplications(token);
      setApps(applications);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load loan applications. Please try again.");
    }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    if (!token) return;
    setBusyId(id);
    try {
      await api.decideApplication(token, id, decision, decision === "approved"
        ? "Business assessment has been verified and reviewed for credit decision"
        : "Loan request rejected following credit assessment");
      await refresh();
      setReviewError("");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not record the credit decision.");
    } finally {
      setBusyId(null);
    }
  };

  const verify = async (id: string, status: "verified" | "rejected") => {
    if (!token || reviewBusy) return;
    setReviewError("");
    setReviewBusy(true);
    try {
      await api.reviewBusiness(token, id, status, reviewNotes);
      await refresh();
      setReviewNotes("");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not record the business review.");
    } finally {
      setReviewBusy(false);
    }
  };

  const selected = apps.find((a) => a.id === selectedId);
  useEffect(() => {
    if (!selectedId || !token) {
      setPaymentStatus(null);
      setPaymentStatusError("");
      setPaymentStatusLoading(false);
      return;
    }
    let active = true;
    setPaymentStatus(null);
    setPaymentStatusError("");
    setPaymentStatusLoading(true);
    getDisbursementStatus(token, selectedId).then(result => {
      if (active) setPaymentStatus(result.disbursement);
    }).catch(error => {
      if (active) setPaymentStatusError(error instanceof Error ? error.message : "Payment information is unavailable.");
    }).finally(() => { if (active) setPaymentStatusLoading(false); });
    return () => { active = false; };
  }, [selectedId, token]);
  const paymentNetwork = paymentStatus?.network === "airtel" ? "Airtel Money" :
    paymentStatus?.network === "mtn" ? "MTN Mobile Money" :
    selected?.channel?.toLowerCase().includes("airtel") ? "Airtel Money" :
    selected?.channel?.toLowerCase().includes("mtn") ? "MTN Mobile Money" : "Not recorded";
  const paymentCompleted = paymentStatus?.status === "settled" || paymentStatus?.status === "completed";
  const paymentMessage = paymentStatusLoading ? "Checking provider and Finance records…" :
    paymentStatusError ? "Payment details could not be confirmed. Check the Finance workspace." :
    paymentCompleted ? "Provider settlement confirmed." :
    paymentStatus?.status === "awaiting_release" ? "Awaiting independent Finance authorization. Funds have not been sent." :
    paymentStatus?.status === "attention_required" ? "Payment needs reconciliation before it can be considered received." :
    paymentStatus?.status === "failed" ? "Payment attempt failed. Finance review is required." :
    paymentStatus ? "Payment is pending provider confirmation; do not treat funds as received." :
    selected?.status === "disbursing" ? "No payment batch details are available. Funds have not been confirmed received." :
    "No disbursement batch is recorded for this application.";

  const filtered = (filter === "All" ? apps : apps.filter(a=>filter === "Pending" ? ["pending", "resubmitted"].includes(a.status) : a.status.toLowerCase()===filter.toLowerCase())).filter(a=>[a.applicantName,a.id,a.purpose,a.businessProfile?.businessName].some(v=>String(v||"").toLowerCase().includes(applicationSearch.trim().toLowerCase())));

  const pendingCount = apps.filter((a) => ["pending", "resubmitted"].includes(a.status)).length;

  return (
    <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Loan Applications">
      <AdminPageHeader
        title="Loan Applications"
        subtitle={`${apps.length} total · ${pendingCount} pending`}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pendingCount > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B", background: "#FEF3C7", padding: "6px 14px", borderRadius: 8 }}>{pendingCount} Pending</span>}
            {canAssignOfficer && <button type="button" onClick={() => onNavigate("admin-officer-assignment")} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0B5E3A", color: "white", fontWeight: 700, cursor: "pointer" }}>Assign field officers</button>}
          </div>
        }
      />
      <p style={{ margin: "-8px 0 14px", color: "#64748B", fontSize: 12 }}>
        Assign officers to pending or resubmitted applications before field review. Approved applications have already completed that stage.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {(["All", "Pending", "Approved", "Rejected"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "11px 17px", minHeight: 44, borderRadius: 10, border: "1px solid #E2E8F0", background: filter === f ? "#0B5E3A" : "white", color: filter === f ? "white" : "#64748B", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {f}
          </button>
        ))}
      </div>

      <ListSearch value={applicationSearch} onChange={setApplicationSearch} placeholder="Search customer, application ID, business or purpose" />
      {loadError && <div role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 10, background: "#FEF2F2", color: "#991B1B" }}>
        {loadError} <button type="button" onClick={() => void refresh()}>Retry</button>
      </div>}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading applications…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>{loadError ? "Applications could not be refreshed." : applicationSearch.trim() ? "No applications match your search." : `No ${filter === "All" ? "" : filter.toLowerCase() + " "}applications yet`}</div>
      ) : (
        <div className="kuula-loan-applications-table">
        <AdminTable
          columns={["Applicant / business", "Amount", "Loan purpose", "Applied", "Decision", "Status", "Action"]}
          rows={filtered.map((a) => [
            <div key={a.id + "-name"}><strong>{a.applicantName || "—"}</strong>{a.businessProfile && <div style={{ fontSize: 11, color: "#64748B" }}>{a.businessProfile.businessName} · {a.businessProfile.sector}</div>}</div>,
            <strong key={a.id + "-amount"} style={{ whiteSpace: "nowrap", fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{ugx(a.amount)}</strong>,
            <span key={a.id + "-purpose"} style={{ fontSize: 14, lineHeight: 1.5 }}>{a.purpose}</span>,
            <span key={a.id + "-applied"} style={{ whiteSpace: "nowrap", fontSize: 14 }}>{fmtDate(a.createdAt)}</span>,
            <span key={a.id + "-decision"} style={{ whiteSpace: "nowrap", color: "#576B60", fontSize: 14 }}>{a.decidedAt ? fmtDate(a.decidedAt) : "Not decided"}</span>,
            <StatusBadge key={a.id + "-s"} status={a.status} />,
            a.status === "pending" ? (
              <div key={a.id + "-act"} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="kx-btn kx-btn--secondary" style={{ minHeight: 40, padding: "9px 13px", fontSize: 14, whiteSpace: "nowrap" }} onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); setReviewNotes(a.businessReviewNotes ?? ""); setReviewError(""); }}>View details</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); setReviewNotes(a.businessReviewNotes ?? ""); setReviewError(""); }}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #0B5E3A", background: "white", color: "#0B5E3A", fontWeight: 700, fontSize: 11 }}>Review business</button>
                {canAssignOfficer && <button type="button" onClick={(e) => {
                  e.stopPropagation();
                  setCreditOperationsSelection({ applicationId: a.id, applicantName: a.applicantName });
                  onNavigate("admin-officer-assignment");
                }}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #0B5E3A", background: "white", color: "#0B5E3A", fontWeight: 700, fontSize: 11 }}>Assign officer</button>}
                {a.businessProfile && <span style={{ fontSize: 10, color: "#556B5D" }}>{a.businessReviewStatus === "verified" ? "Verified" : "Needs verification"}</span>}
                <button disabled={busyId === a.id || (Boolean(a.businessProfile) && a.businessReviewStatus !== "verified")} title={a.businessProfile && a.businessReviewStatus !== "verified" ? "Complete the documented business verification before approval" : "Approve loan"} onClick={(e) => { e.stopPropagation(); void decide(a.id, "approved"); }}
                  style={{ padding: "4px 10px", borderRadius: 6, background: "#178654", color: "white", border: "none", fontSize: 11, fontWeight: 600, opacity: a.businessProfile && a.businessReviewStatus !== "verified" ? 0.4 : 1, cursor: busyId === a.id ? "not-allowed" : "pointer" }}>
                  {busyId === a.id ? "…" : "Approve"}
                </button>
                <button disabled={busyId === a.id} onClick={(e) => { e.stopPropagation(); decide(a.id, "rejected"); }}
                  style={{ padding: "4px 10px", borderRadius: 6, background: "#EF4444", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: busyId === a.id ? "not-allowed" : "pointer" }}>
                  Reject
                </button>
              </div>
            ) : (
              <button key={a.id + "-details"} type="button" className="kx-btn kx-btn--secondary"
                style={{ minHeight: 44, padding: "10px 15px", fontSize: 14, fontWeight: 750, whiteSpace: "nowrap" }}
                onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); setReviewNotes(a.businessReviewNotes ?? ""); setReviewError(""); }}>
                View details
              </button>
            ),
          ])}
        />
        </div>
      )}
      {reviewError && <div role="alert" style={{ padding: 12, marginTop: 10, borderRadius: 10, background: "#FEF2F2", color: "#991B1B" }}>{reviewError}</div>}
      {selected && (
        <section aria-label="Business credit review" style={{ marginTop: 18, background: "white", padding: 20, borderRadius: 16, border: "1px solid #DAE8DF" }}>
          <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Application details — {selected.applicantName}</h2>
              <p style={{ color: "#66756D", fontSize: 14 }}>Reference {selected.agreementNumber || selected.id} · {selected.termDays} days · {ugx(selected.amount)} · Status: {selected.status.replaceAll("_", " ")}</p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} style={{ border: 0, background: "transparent", fontWeight: 700 }}>Close</button>
          </div>
          <section aria-label="Payment and settlement status" style={{ marginTop: 18, padding: 18, background: "#F4F8F5", borderRadius: 12, border: "1px solid #DBE7DE" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: "#153C28", margin: "0 0 12px" }}>Payment and settlement</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, margin: 0 }}>
              <div><dt style={{ fontSize: 13, color: "#657B6E" }}>Mobile Money network</dt><dd style={{ margin: "5px 0 0", fontSize: 16, fontWeight: 750 }}>{paymentNetwork}</dd></div>
              <div><dt style={{ fontSize: 13, color: "#657B6E" }}>Payment batch</dt><dd style={{ margin: "5px 0 0", fontSize: 16, fontWeight: 750 }}>{paymentStatus?.status?.replaceAll("_", " ") || "Not confirmed"}</dd></div>
              <div><dt style={{ fontSize: 13, color: "#657B6E" }}>Settled amount</dt><dd style={{ margin: "5px 0 0", fontSize: 16, fontWeight: 750 }}>{paymentStatus ? ugx(paymentStatus.totalSettled) : "Not confirmed"}</dd></div>
              <div><dt style={{ fontSize: 13, color: "#657B6E" }}>Outstanding payout</dt><dd style={{ margin: "5px 0 0", fontSize: 16, fontWeight: 750 }}>{paymentStatus ? ugx(paymentStatus.remainingAmount) : "Not confirmed"}</dd></div>
            </dl>
            <p role="status" style={{ fontSize: 14, lineHeight: 1.55, margin: "14px 0 0", color: "#355444" }}>{paymentMessage}</p>
            <p style={{ fontSize: 12, color: "#697E70", marginBottom: 0 }}>Read-only payment evidence. Only authorized Finance staff may release or reconcile funds.</p>
          </section>
          {token && <GuarantorStaffReview token={token} applicationId={selected.id} applicationStatus={selected.status} />}
          {selected.businessProfile ? (
            <>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, fontSize: 13 }}>
                {([
                  ["Business name", selected.businessProfile.businessName],
                  ["Sector", selected.businessProfile.sector],
                  ["Registered?", selected.businessProfile.tradingAs],
                  ["Registration number", selected.businessProfile.registrationNumber || "Not formally registered"],
                  ["Trading history", selected.businessProfile.tradingMonths + " months"],
                  ["District and location", selected.businessProfile.district + ", " + selected.businessProfile.physicalAddress],
                  ["Products / services", selected.businessProfile.goodsOrServices],
                  ["Monthly sales (declared)", ugx(selected.businessProfile.monthlySales)],
                  ["Monthly business expenses (declared)", ugx(selected.businessProfile.monthlyBusinessExpenses)],
                  ["Existing debt payments (declared)", ugx(selected.businessProfile.monthlyExistingDebt)],
                  ["Guarantor contacts", selected.businessProfile.guarantors?.map(guarantor => `${guarantor.name} (${guarantor.phone})`).join(" · ") || "Not supplied on this application"],
                  ["Business verification", selected.businessReviewStatus ?? "Pending"],
                ] as [string, string][]).map(([label, value]) => <div key={label}><dt style={{ color: "#68766F", marginBottom: 4 }}>{label}</dt><dd style={{ fontWeight: 700, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</dd></div>)}
              </dl>
              {token && <BusinessPhotoReview token={token} applicationId={selected.id} />}
              <p style={{ fontSize: 12, color: "#68766F", marginTop: 12 }}>Declarations require independent document / field evidence. Do not mark verified based only on what the borrower entered.</p>
              {["pending", "resubmitted"].includes(selected.status) && (
                <div style={{ marginTop: 16 }}>
                  <label htmlFor="business-review-notes" style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Verification findings and supporting evidence reference</label>
                  <textarea id="business-review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={4} maxLength={2000} style={{ width: "100%", marginTop: 6, padding: 12, border: "1px solid #D1D5DB", borderRadius: 10 }} placeholder="Describe business visit, turnover evidence, registration check and affordability findings (min 15 characters)." />
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" disabled={reviewBusy || reviewNotes.trim().length < 15} onClick={() => void verify(selected.id, "verified")} className="kx-btn kx-btn--primary">Mark business verified</button>
                    <button type="button" disabled={reviewBusy || reviewNotes.trim().length < 15} onClick={() => void verify(selected.id, "rejected")} className="kx-btn kx-btn--secondary">Verification unsuccessful</button>
                  </div>
                </div>
              )}
              {selected.businessReviewNotes && <p style={{ fontSize: 12, color: "#475569", whiteSpace: "pre-wrap" }}>Latest review: {selected.businessReviewNotes}</p>}
            </>
          ) : <p style={{ fontSize: 13, color: "#64748B" }}>Historical loan: no business profile collected. Existing loan records remain accessible.</p>}
        </section>
      )}
    </AdminLayout>
  );
}

// A3.2
export function AdminActiveLoansListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [recordSearch,setRecordSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setApps(applications.filter((a) => ["approved", "active"].includes(a.status))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-active-loans" onNavigate={onNavigate} title="Active Loans">
      <AdminPageHeader title="Active Loans" subtitle={loading ? "Loading…" : `${apps.length} loans currently active`}
        action={<button disabled={loading || apps.length === 0} onClick={() => downloadCsv("kuula-active-loans", ["Customer", "Loan ID", "Amount (UGX)", "Applied", "Status"], apps.map((a) => [a.applicantName || "—", a.id, a.amount, fmtDate(a.createdAt), a.status]))} style={{ padding:"8px 14px",borderRadius:8,background:"white",border:"1px solid #E2E8F0",color:"#374151",fontSize:12,fontWeight:600,cursor: loading || apps.length === 0 ? "default" : "pointer",opacity: loading || apps.length === 0 ? 0.6 : 1,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export CSV</button>}
      />
      <ExportToolbar title="Authorized active facilities" filename="kuula-active-facilities" columns={["Customer","Application ID","Amount (UGX)","Applied","Status"]} rows={apps.map(a=>[a.applicantName||"—",a.id,a.amount,fmtDate(a.createdAt),a.status])} disabled={loading}/>
      <ListSearch value={recordSearch} onChange={setRecordSearch} placeholder="Search active customer or loan ID" />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Active Loans" value={loading ? "…" : String(apps.length)} color="#0B5E3A" icon={<></>} />
        <StatCard label="Total Amount" value={loading ? "…" : `UGX ${(apps.reduce((s, a) => s + a.amount, 0) / 1000000).toFixed(1)}M`} color="#178654" icon={<></>} />
        <StatCard label="Pending Decisions" value={loading ? "…" : String(apps.filter(a => a.status === "pending").length)} color="#F59E0B" icon={<></>} />
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading active loans…</div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No active loans</div>
      ) : (
        <AdminTable
          columns={["Customer", "Loan ID", "Amount", "Applied", "Status"]}
          rows={apps.filter(a=>[a.applicantName,a.id,a.purpose].some(v=>String(v||"").toLowerCase().includes(recordSearch.trim().toLowerCase()))).map((a) => [
            a.applicantName || "—",
            a.id.slice(0, 12),
            ugx(a.amount),
            fmtDate(a.createdAt),
            <StatusBadge key={a.id} status={a.status} />,
          ])}
        />
      )}
    </AdminLayout>
  );
}

// A3.6
export function AdminOverdueLoansListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [overdueSearch,setOverdueSearch] = useState("");
  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("contact");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseStatus, setPromiseStatus] = useState("kept");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    if (!token) { setLoading(false); return; }
    api.getCollections(token)
      .then((result) => { setAccounts(result.accounts); setActivities(result.activities); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load overdue accounts"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, [token]);

  async function addActivity() {
    if (!token || !selected || !note.trim()) return;
    try {
      await api.addCollectionActivity(token, selected, { activityType, note:note.trim(), ...(activityType==="promise_to_pay"?{promiseAmount:Number(promiseAmount),promiseDate}: {}), ...(activityType==="promise_update"?{promiseStatus}:{}), ...(activityType==="assignment"?{assignedTo:state.user?.id}: {}) });
      setNote(""); setPromiseAmount(""); setPromiseDate(""); refresh();
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Activity could not be saved"); }
  }

  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Overdue Loans">
      <AdminPageHeader title="Overdue Loans" subtitle={loading ? "Loading…" : `${accounts.length} loans past due date`} />
      {error&&<p role="alert" style={{color:"#991B1B"}}>{error}</p>}
      {accounts.length > 0 && (
        <div style={{ padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16 }}>
          <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>⚠ {accounts.length} loan{accounts.length !== 1 ? "s are" : " is"} overdue. Contact customers immediately.</p>
        </div>
      )}
      <ListSearch value={overdueSearch} onChange={setOverdueSearch} placeholder="Search overdue customer or repayment reference" />
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No overdue loans 🎉</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><AdminTable
          columns={["Customer", "Amount due", "Days past due", "Status"]}
          rows={accounts.filter(a=>[a.full_name,a.repayment_id].some(v=>String(v||"").toLowerCase().includes(overdueSearch.trim().toLowerCase()))).map((a) => [
            <button key={String(a.repayment_id)} onClick={()=>setSelected(String(a.repayment_id))}>{String(a.full_name||"—")}</button>,
            ugx(Number(a.total||0)-Number(a.amount_paid||0)),
            String(a.days_past_due||0), <StatusBadge key={String(a.repayment_id)} status="overdue" />,
          ])}/><AdminCard>{!selected?<p>Select an account to record recovery work.</p>:<><h3>Collection activity</h3><select value={activityType} onChange={e=>setActivityType(e.target.value)}><option value="contact">Contact</option><option value="note">Note</option><option value="assignment">Assign to me</option><option value="promise_to_pay">Promise to pay</option><option value="promise_update">Update promise status</option></select>{activityType==="promise_to_pay"&&<div><input aria-label="Promise amount" type="number" min="1" value={promiseAmount} onChange={e=>setPromiseAmount(e.target.value)}/><input aria-label="Promise date" type="date" value={promiseDate} onChange={e=>setPromiseDate(e.target.value)}/></div>}{activityType==="promise_update"&&<select aria-label="Promise status" value={promiseStatus} onChange={e=>setPromiseStatus(e.target.value)}><option value="kept">Kept</option><option value="broken">Broken</option><option value="cancelled">Cancelled</option></select>}<textarea aria-label="Collection note" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/><button onClick={()=>void addActivity()}>Save activity</button><h4>History</h4>{activities.filter(a=>a.repayment_id===selected).map(a=><div key={String(a.id)}><strong>{String(a.activity_type).replaceAll("_"," ")}</strong>{a.promise_status?` (${String(a.promise_status)})`:""} — {String(a.note)}<small> {new Date(String(a.created_at)).toLocaleString()}</small></div>)}</>}</AdminCard></div>
      )}
    </AdminLayout>
  );
}

// A3.9
export function AdminLoanHistoryAllScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [recordSearch,setRecordSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setApps(applications.filter((a) => ["paid", "rejected"].includes(a.status))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-loan-history" onNavigate={onNavigate} title="Loan History">
      <AdminPageHeader title="Loan History (All)" subtitle={loading ? "Loading…" : `${apps.length} closed applications`}
        action={<button disabled={loading || apps.length === 0} onClick={() => downloadCsv("kuula-loan-history", ["Customer", "Amount (UGX)", "Purpose", "Date", "Status"], apps.map((a) => [a.applicantName || "—", a.amount, a.purpose, fmtDate(a.createdAt), a.status]))} style={{ padding:"8px 14px",borderRadius:8,background:"white",border:"1px solid #E2E8F0",color:"#374151",fontSize:12,fontWeight:600,cursor: loading || apps.length === 0 ? "default" : "pointer",opacity: loading || apps.length === 0 ? 0.6 : 1,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export</button>}
      />
      <ListSearch value={recordSearch} onChange={setRecordSearch} placeholder="Search loan history by customer, ID or purpose" />
      <ExportToolbar title="Authorized loan history" filename="kuula-loan-history" columns={["Customer","Amount (UGX)","Purpose","Date","Status"]} rows={apps.map(a=>[a.applicantName||"—",a.amount,a.purpose,fmtDate(a.createdAt),a.status])} disabled={loading}/>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No closed loans yet</div>
      ) : (
        <AdminTable
          columns={["Customer", "Amount", "Purpose", "Date", "Status"]}
          rows={apps.map((a) => [
            a.applicantName || "—",
            ugx(a.amount),
            a.purpose,
            fmtDate(a.createdAt),
            <StatusBadge key={a.id} status={a.status} />,
          ])}
        />
      )}
    </AdminLayout>
  );
}
