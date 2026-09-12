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

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try { const result = await api.getAdminKycQueue(token, status); setRows(result.submissions); setSelected(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not load KYC submissions."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token, status]);

  const decide = async (decision: "verified" | "rejected") => {
    if (!token || !selected || !reason.trim()) { setError("Enter a written decision reason."); return; }
    setBusy(true); setError("");
    try { await api.decideAdminKyc(token, String(selected.id), decision, reason.trim()); setReason(""); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not record the KYC decision."); }
    finally { setBusy(false); }
  };

  return <AdminLayout activeScreen="admin-customer-kyc" onNavigate={onNavigate} title="KYC Verification">
    <AdminPageHeader title="Smile ID review queue" subtitle="Provider results and staff decisions are read from the KYC submission record." />
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>{["pending", "verified", "rejected", "all"].map(value => <button key={value} onClick={() => setStatus(value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D9E7DF", background: status === value ? "#0B5E3A" : "white", color: status === value ? "white" : "#334155" }}>{value.replace("pending", "Needs review")}</button>)}</div>
    {error && <div role="alert" style={{ marginBottom: 14, color: "#B91C1C", background: "#FEF2F2", padding: 12, borderRadius: 10 }}>{error}</div>}
    {loading ? <AdminCard>Loading KYC submissions…</AdminCard> : rows.length === 0 ? <AdminCard>No {status === "all" ? "" : status} KYC submissions.</AdminCard> : <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(320px,1.2fr)", gap: 14 }}>
      <AdminCard>{rows.map(row => <button key={String(row.id)} onClick={() => setSelected(row)} style={{ display: "block", width: "100%", textAlign: "left", padding: 12, marginBottom: 8, background: selected?.id === row.id ? "#EAF6EF" : "white", border: "1px solid #D9E7DF", borderRadius: 10 }}><strong>{String(row.fullName || "Unnamed customer")}</strong><div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{String(row.nationalId || "No NIN")} · {String(row.provider || "No provider")}</div><StatusBadge status={String(row.status || "pending")} /></button>)}</AdminCard>
      <AdminCard>{!selected ? "Select a submission to review its provider result." : <><h3 style={{ marginTop: 0 }}>{String(selected.fullName)}</h3><p>Provider: <strong>{String(selected.provider || "Not available")}</strong></p><p>Provider status: <strong>{String(selected.providerStatus || "Awaiting result")}</strong></p><p>Submitted: <strong>{selected.submittedAt ? new Date(String(selected.submittedAt)).toLocaleString() : "Not available"}</strong></p>{selected.status === "pending" && <><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Required review reason" style={{ width: "100%", minHeight: 90, padding: 10, boxSizing: "border-box" }} /><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button disabled={busy || selected.providerStatus !== "attention"} onClick={() => void decide("verified")}>Approve reviewed exception</button><button disabled={busy} onClick={() => void decide("rejected")}>Reject</button></div>{selected.provider === "smile-id" && selected.providerStatus !== "attention" && <p style={{ color: "#64748B", fontSize: 12 }}>Approval is disabled until Smile ID requests human review.</p>}</>}</>}</AdminCard>
    </div>}
  </AdminLayout>;
}
