import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { AdminCard, AdminLayout, AdminPageHeader, StatusBadge } from "../AdminLayout";

interface Props { onNavigate: (screen: string) => void }
type Row = Record<string, unknown>;

export function AdminKycQueueScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try { const result = await api.getAdminKycQueue(token, status); setRows(result.submissions); setSelected(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not load KYC submissions."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token, status]);

  const selectRow = (row: Row) => {
    setSelected(row);
    setPreviews({});
    setPreviewError("");
    setReason("");
  };
  const loadImages = async () => {
    if (!token || !selected) return;
    setPreviewError(""); setPreviewBusy(true);
    try {
      const sides = ["front", "back", "portrait"] as const;
      const available = sides.filter(side => Boolean(selected[side === "front" ? "hasFront" : side === "back" ? "hasBack" : "hasPortrait"]));
      const result = await Promise.all(available.map(async side => {
        const image = await api.getAdminKycPreview(token, String(selected.id), side);
        if (!image.url && !image.dataUrl) throw new Error("Image could not be opened");
        return [side, image.url || image.dataUrl || ""] as const;
      }));
      setPreviews(Object.fromEntries(result));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Could not load document images.");
    } finally { setPreviewBusy(false); }
  };
  const decide = async (decision: "verified" | "rejected") => {
    if (!token || !selected || !reason.trim()) { setError("Enter a written decision reason."); return; }
    setBusy(true); setError("");
    try { await api.decideAdminKyc(token, String(selected.id), decision, reason.trim()); setReason(""); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not record the KYC decision."); }
    finally { setBusy(false); }
  };

  return <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC Verification">
    <AdminPageHeader title="Identity document review" subtitle="Review the National ID front, back and portrait before approving an account." />
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>{["pending", "verified", "rejected", "all"].map(value => <button key={value} onClick={() => setStatus(value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D9E7DF", background: status === value ? "#0B5E3A" : "white", color: status === value ? "white" : "#334155" }}>{value.replace("pending", "Needs review")}</button>)}</div>
    {error && <div role="alert" style={{ marginBottom: 14, color: "#B91C1C", background: "#FEF2F2", padding: 12, borderRadius: 10 }}>{error}</div>}
    {loading ? <AdminCard>Loading KYC submissions…</AdminCard> : rows.length === 0 ? <AdminCard>No {status === "all" ? "" : status} KYC submissions.</AdminCard> : <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(320px,1.2fr)", gap: 14 }}>
      <AdminCard>{rows.map(row => <button key={String(row.id)} onClick={() => selectRow(row)} style={{ display: "block", width: "100%", textAlign: "left", padding: 12, marginBottom: 8, background: selected?.id === row.id ? "#EAF6EF" : "white", border: "1px solid #D9E7DF", borderRadius: 10 }}><strong>{String(row.fullName || "Unnamed customer")}</strong><div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{String(row.nationalId || "No NIN")} · {String(row.provider || "No provider")}</div><StatusBadge status={String(row.status || "pending")} /></button>)}</AdminCard>
      <AdminCard>
        {!selected ? "Select a submission to review its photographs and ID details." : <>
          <h3 style={{ marginTop: 0 }}>{String(selected.fullName)}</h3>
          <p>National ID: <strong>{String(selected.nationalId || "Not provided")}</strong></p>
          <p>Date of birth: <strong>{selected.dateOfBirth ? new Date(String(selected.dateOfBirth)).toLocaleDateString("en-UG") : "Not provided"}</strong></p>
          <p>Capture method: <strong>{selected.provider === "kuula-manual" ? "Direct document upload" : String(selected.provider || "Legacy")}</strong></p>
          <p>Status: <strong>{String(selected.providerStatus || "Awaiting review")}</strong></p>
          <p>Submitted: <strong>{selected.submittedAt ? new Date(String(selected.submittedAt)).toLocaleString() : "Not available"}</strong></p>
          <button type="button" onClick={() => void loadImages()} disabled={previewBusy} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid #0B5E3A", background: "white", color: "#0B5E3A", fontWeight: 700 }}>
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
            <textarea id="kyc-decision-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Document your checks and reasons" style={{ width: "100%", minHeight: 90, padding: 10, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" disabled={busy || reason.trim().length < 10 || (selected.provider === "kuula-manual" && (Object.keys(previews).length !== 3 || !selected.hasPortrait || !selected.hasFront || !selected.hasBack)) || (selected.provider === "smile-id" && selected.providerStatus !== "attention")} onClick={() => void decide("verified")}>Approve after verification</button>
              <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide("rejected")}>Reject / request new photos</button>
            </div>
          </>}
        </>}
      </AdminCard>
    </div>}
  </AdminLayout>;
}
