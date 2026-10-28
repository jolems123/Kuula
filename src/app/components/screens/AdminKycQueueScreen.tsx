import { ListSearch } from "../ListSearch";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Images, ChevronRight } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { AdminCard, AdminLayout, AdminPageHeader, StatusBadge } from "../AdminLayout";

interface Props { onNavigate: (screen: string) => void }
type Row = Record<string, unknown>;

export function AdminKycQueueScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [status, setStatus] = useState("customers");
  const [search,setSearch]=useState("");
  const [customers, setCustomers] = useState<Array<{id:string;fullName:string;phone:string|null;email:string|null;kycStatus:string;latestSubmission:{id:string;version:number;status:string;decisionReason:string|null}|null}>>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [notice, setNotice] = useState("");
  const selectionVersion = useRef(0);

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      if (status === "customers") { const result = await api.getAdminKycCustomers(token); setCustomers(result.customers); setRows([]); }
      else { const result = await api.getAdminKycQueue(token, status); setRows(result.submissions); }
      selectionVersion.current++; setSelected(null); setPreviews({});
    }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not load KYC submissions."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token, status]);

  const selectRow = (row: Row) => {
    if (busy) return;
    selectionVersion.current++;
    setSelected(row);
    setPreviews({});
    setPreviewError("");
    setReason("");
    setError(""); setNotice(""); setPreviewBusy(false);
  };
  const loadImages = async () => {
    if (!token || !selected || previewBusy || busy) return;
    const version = selectionVersion.current;
    setError(""); setPreviewError(""); setPreviewBusy(true);
    try {
      const sides = ["front", "back", "portrait"] as const;
      const available = sides.filter(side => Boolean(selected[side === "front" ? "hasFront" : side === "back" ? "hasBack" : "hasPortrait"]));
      const result = await Promise.all(available.map(async side => {
        const image = await api.getAdminKycPreview(token, String(selected.id), side);
        if (!image.url && !image.dataUrl) throw new Error("Image could not be opened");
        return [side, image.url || image.dataUrl || ""] as const;
      }));
      if (selectionVersion.current === version) setPreviews(Object.fromEntries(result));
    } catch (e) {
      if (selectionVersion.current === version) setPreviewError(e instanceof Error ? e.message : "Could not load document images.");
    } finally { if (selectionVersion.current === version) setPreviewBusy(false); }
  };
  const decide = async (decision: "verified" | "rejected") => {
    if (busy) return;
    if (!token || !selected) { setError("Select a customer submission to review."); return; }
    if (reason.trim().length < 10) { setError("Write your review decision notes first (at least 10 characters)."); return; }
    if (decision === "verified" && selected.provider === "kuula-manual" &&
      (!selected.hasFront || !selected.hasBack || !selected.hasPortrait || !previews.front || !previews.back || !previews.portrait)) {
      setError("Open and review all three photographs using “Review ID and portrait photographs” before approving."); return;
    }
    if (decision === "verified" && selected.provider === "smile-id" && selected.providerStatus !== "attention") {
      setError("This legacy submission is not eligible for manual approval. Request new photographs instead."); return;
    }
    setBusy(true); setError("");
    try { await api.decideAdminKyc(token, String(selected.id), decision, reason.trim()); setReason(""); await load(); setNotice(decision === "verified" ? "Customer identity approved successfully." : "Submission rejected. The customer can upload new photographs."); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not record the KYC decision."); }
    finally { setBusy(false); }
  };

  return <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC Verification">
    <AdminPageHeader title="KYC verification" subtitle="Monitor customer identity status and review submitted documents." />
    <div className="kx-kyc-filters" aria-label="Submission status">{["customers", "pending", "verified", "rejected", "all"].map(value => <button type="button" key={value} disabled={busy} aria-pressed={status === value} onClick={() => setStatus(value)} className={`kx-btn ${status === value ? "kx-kyc-approve" : "kx-btn--secondary"}`}>{value === "customers" ? "All customers" : value === "pending" ? "Needs review" : value === "verified" ? "Approved" : value === "rejected" ? "Rejected" : "All submissions"}</button>)}</div>
    <ListSearch value={search} onChange={setSearch} placeholder={status === "customers" ? "Filter customers by name, phone or email" : "Filter submissions by name or National ID"} />
    {status === "customers" && !loading && !error && <section className="kuula-kyc-overview" aria-label="All registered customer identity statuses">
      <div className="kuula-kyc-overview__metrics">
        {([["Registered customers",customers.length],["Not submitted",customers.filter(c=>c.kycStatus==="not_submitted").length],["Pending review",customers.filter(c=>c.kycStatus==="pending").length],["Verified",customers.filter(c=>c.kycStatus==="verified").length],["Rejected",customers.filter(c=>c.kycStatus==="rejected").length]] as const).map(([label,value])=><div key={label} className="kuula-kyc-overview__metric"><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <AdminCard><h3>Customer KYC status</h3><p>One row per registered customer. Select a submission filter above to examine document review history.</p>
        <div className="kuula-kyc-customer-list">{customers.filter(customer=>[customer.fullName,customer.phone,customer.email].some(v=>String(v||"").toLowerCase().includes(search.trim().toLowerCase()))).map(customer=><div key={customer.id} className="kuula-kyc-customer-row">
          <div><strong>{customer.fullName || "Unnamed customer"}</strong><small>{customer.phone || customer.email || "No contact listed"}</small></div>
          <div><StatusBadge status={customer.kycStatus}/><small>{customer.latestSubmission ? `Submission ${customer.latestSubmission.version}` : "No identity documents submitted"}</small></div>
          {customer.latestSubmission && <button type="button" className="kx-btn kx-btn--secondary" onClick={()=>setStatus(customer.kycStatus==="not_submitted"?"all":customer.kycStatus)}>View submissions</button>}
        </div>)}</div>
      </AdminCard>
    </section>}
    {notice && <div className="kx-alert kx-alert--success" role="status" style={{ marginBottom: 16 }}><CheckCircle2 size={18} />{notice}</div>}
    {error && !selected && <div role="alert" style={{ marginBottom: 14, color: "#B91C1C", background: "#FEF2F2", padding: 12, borderRadius: 10 }}>{error}</div>}
    {status === "customers" ? (loading ? <AdminCard>Loading customers…</AdminCard> : error ? <AdminCard>Customer registry is temporarily unavailable. Please retry after the API is available.</AdminCard> : null) : loading ? <AdminCard>Loading KYC submissions…</AdminCard> : rows.length === 0 ? <AdminCard>No {status === "all" ? "" : status} KYC submissions.</AdminCard> : <div className="kx-kyc-review-grid">
      <AdminCard>{rows.filter(row=>[row.fullName,row.nationalId].some(v=>String(v||"").toLowerCase().includes(search.trim().toLowerCase()))).map(row => <button type="button" disabled={busy} aria-pressed={selected?.id === row.id} className="kx-kyc-submission" key={String(row.id)} onClick={() => selectRow(row)}><div className="kx-kyc-submission__title"><strong>{String(row.fullName || "Unnamed customer")}</strong><ChevronRight size={18} /></div><div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{String(row.nationalId || "No NIN")} · {String(row.provider || "No provider")}</div><StatusBadge status={String(row.status || "pending")} /><span style={{fontSize:12,color:"#64748B",display:"block",marginTop:6}}>Submission {String(row.version ?? "—")}</span></button>)}</AdminCard>
      <AdminCard>
        {!selected ? "Select a submission to review its photographs and ID details." : <>
          <h3 style={{ marginTop: 0 }}>{String(selected.fullName)}</h3>
          <p>National ID: <strong>{String(selected.nationalId || "Not provided")}</strong></p>
          <p>Date of birth: <strong>{selected.dateOfBirth ? new Date(String(selected.dateOfBirth)).toLocaleDateString("en-UG") : "Not provided"}</strong></p>
          <p>Submission version: <strong>{String(selected.version ?? "Not available")}</strong></p>
          {selected.status === "rejected" && <div className="kx-alert kx-alert--error" role="status"><strong>Previous review rejected:</strong> {String(selected.decisionReason || "No review reason recorded.")} The customer can resubmit the complete set of photographs; the next submission will have a new version.</div>}
          <p>Capture method: <strong>{selected.provider === "kuula-manual" ? "Direct document upload" : String(selected.provider || "Legacy")}</strong></p>
          <p>Status: <strong>{String(selected.providerStatus || "Awaiting review")}</strong></p>
          <p>Submitted: <strong>{selected.submittedAt ? new Date(String(selected.submittedAt)).toLocaleString() : "Not available"}</strong></p>
          <button type="button" className="kx-btn kx-btn--secondary kx-kyc-photo-button" onClick={() => void loadImages()} disabled={previewBusy || busy}><Images size={18} />
            {previewBusy ? "Opening photos…" : "Review ID and portrait photographs"}
          </button>
          {previewError && <p role="alert" style={{ color: "#B91C1C" }}>{previewError}</p>}
          {Object.keys(previews).length > 0 && <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 14 }}>
            {(["front", "back", "portrait"] as const).map(side => previews[side] && <figure key={side} style={{ margin: 0 }}>
              <img src={previews[side]} alt={side === "portrait" ? "Applicant portrait photograph" : "National ID " + side} style={{ width: "100%", height: 168, objectFit: "contain", borderRadius: 8, background: "#F1F5F9" }} />
              <figcaption style={{ fontSize: 12, fontWeight: 700, textAlign: "center", marginTop: 6 }}>{side === "portrait" ? "Portrait" : "National ID " + side}</figcaption>
            </figure>)}
          </div>}
          {selected.status === "pending" && <>
            <p style={{ fontSize: 12, marginTop: 14, color: "#64748B" }}>Before approving, independently compare the front and back, the claimed NIN, the portrait and borrower details. Photographs alone do not prove authenticity.</p>
            <label htmlFor="kyc-decision-reason" style={{ fontWeight: 700, fontSize: 13 }}>Review decision notes</label>
            <textarea id="kyc-decision-reason" className="kx-kyc-notes" disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="Document your checks and reasons (at least 10 characters)" aria-describedby="kyc-review-help" />
            <p id="kyc-review-help" className="kx-kyc-help">Review all three photographs and write your decision notes. Missing steps will be explained when you select an action.</p>
            {error && <div className="kx-alert kx-alert--error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
            <div className="kx-kyc-decision-actions" aria-busy={busy}>
              <button type="button" className="kx-btn kx-kyc-approve" disabled={busy} onClick={() => void decide("verified")}><CheckCircle2 size={20} />{busy ? "Saving decision…" : "Approve customer identity"}</button>
              <button type="button" className="kx-btn kx-kyc-reject" disabled={busy} onClick={() => void decide("rejected")}><XCircle size={20} />Reject / request new photos</button>
            </div>
          </>}
        </>}
      </AdminCard>
    </div>}
  </AdminLayout>;
}
