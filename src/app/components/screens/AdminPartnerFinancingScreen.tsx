import { useEffect, useState } from "react";
import { Building2, RefreshCw, ShieldCheck } from "lucide-react";
import { AdminLayout, AdminCard, AdminPageHeader, StatusBadge } from "../AdminLayout";
import { env } from "../../config/env";
import { ApiError } from "../../api/types";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (screen: string) => void; }
interface PartnerRequest {
  id: string;
  status: string;
  customer: { id: string; fullName: string; phone: string | null; kycVerified: boolean };
  partner: { id: string; code: string; name: string; type: string };
  location: { id: string; name: string; district: string | null } | null;
  product: { code: string; name: string; category: string };
  purpose: string;
  invoiceReference: string | null;
  amount: number;
  payeeName: string;
  application: { id: string; status: string; termDays: number; creditScore: number | null; approvedLimit: number | null } | null;
  createdAt: string;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const input: React.CSSProperties = { width: "100%", height: 42, border: "1px solid #DCE6E0", borderRadius: 9, padding: "0 10px", boxSizing: "border-box" };
const button: React.CSSProperties = { border: 0, background: "#0B5E3A", color: "white", borderRadius: 9, padding: "10px 14px", fontWeight: 800, cursor: "pointer" };
const money = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;

export function AdminPartnerFinancingScreen({ onNavigate }: Props) {
  const token = useAppContext().state.session.token;
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [selected, setSelected] = useState<PartnerRequest | null>(null);
  const [network, setNetwork] = useState("mtn");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token) return;
    setError("");
    try {
      const result = await call<{ requests: PartnerRequest[] }>(token, "/api/admin/partner-financing");
      setRequests(result.requests);
      if (selected) setSelected(result.requests.find((item) => item.id === selected.id) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load partner financing requests."); }
  };
  useEffect(() => { void load(); }, [token]);

  const verify = async () => {
    if (!token || !selected || !reference.trim() || note.trim().length < 20 || busy) return;
    setBusy(true); setError("");
    try {
      await call(token, `/api/admin/partner-financing/${selected.id}/verify-payee`, {
        method: "POST",
        body: JSON.stringify({ network, settlementReference: reference.trim(), note: note.trim() }),
      });
      setReference(""); setNote("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not verify partner settlement details."); }
    finally { setBusy(false); }
  };

  return <AdminLayout activeScreen="admin-partner-financing" onNavigate={onNavigate} title="Partner Financing">
    <AdminPageHeader title="Partner invoice & payee verification" subtitle="Restricted-purpose credit cannot become an offer until the invoice and an independently verified partner Mobile Money destination are confirmed." action={<button style={{ ...button, background: "white", color: "#334155", border: "1px solid #DCE6E0" }} onClick={() => void load()}><RefreshCw size={14}/> Refresh</button>} />
    {error && <div style={{ background: "#FFF1F1", color: "#991B1B", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12 }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16 }}>
      <AdminCard>
        <h3 style={{ marginTop: 0 }}>Verification queue</h3>
        {requests.length === 0 ? <p style={{ color: "#64748B", fontSize: 12 }}>No partner-credit requests require attention.</p> : requests.map((item) => <button key={item.id} onClick={() => setSelected(item)} style={{ width: "100%", border: selected?.id === item.id ? "2px solid #0B5E3A" : "1px solid #E2E8F0", background: selected?.id === item.id ? "#F0FDF4" : "white", borderRadius: 11, padding: 12, textAlign: "left", marginBottom: 9, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{item.customer.fullName}</strong><StatusBadge status={item.status}/></div>
          <div style={{ marginTop: 5, fontSize: 11, color: "#64748B" }}>{item.product.name} · {item.partner.name}</div>
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>{money(item.amount)} · {item.invoiceReference || "No invoice reference"}</div>
        </button>)}
      </AdminCard>

      <AdminCard>
        {!selected ? <div style={{ textAlign: "center", padding: 28, color: "#64748B" }}><Building2 size={30}/><p>Select a partner-credit request.</p></div> : <>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}><ShieldCheck size={20} color="#0B5E3A"/><h3 style={{ margin: 0 }}>Verify settlement destination</h3></div>
          <div style={{ marginTop: 14, display: "grid", gap: 7, fontSize: 12 }}>
            <div><span style={{ color: "#64748B" }}>Customer:</span> <strong>{selected.customer.fullName}</strong></div>
            <div><span style={{ color: "#64748B" }}>KYC:</span> <strong>{selected.customer.kycVerified ? "Verified" : "Not verified"}</strong></div>
            <div><span style={{ color: "#64748B" }}>Partner/payee:</span> <strong>{selected.payeeName}</strong></div>
            <div><span style={{ color: "#64748B" }}>Invoice/order:</span> <strong>{selected.invoiceReference || "—"}</strong></div>
            <div><span style={{ color: "#64748B" }}>Purpose:</span> <strong>{selected.purpose}</strong></div>
            <div><span style={{ color: "#64748B" }}>Amount:</span> <strong>{money(selected.amount)}</strong></div>
            <div><span style={{ color: "#64748B" }}>Credit score:</span> <strong>{selected.application?.creditScore ?? "—"}</strong></div>
          </div>
          <div style={{ height: 1, background: "#E2E8F0", margin: "14px 0" }}/>
          <label style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>NETWORK<select value={network} onChange={(e) => setNetwork(e.target.value)} style={{ ...input, marginTop: 5 }}><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></label>
          <label style={{ display: "block", marginTop: 10, fontSize: 11, fontWeight: 800, color: "#475569" }}>VERIFIED PARTNER MOBILE MONEY NUMBER<input value={reference} onChange={(e) => setReference(e.target.value)} style={{ ...input, marginTop: 5 }} placeholder="+256…" /></label>
          <label style={{ display: "block", marginTop: 10, fontSize: 11, fontWeight: 800, color: "#475569" }}>VERIFICATION NOTE<textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", minHeight: 90, border: "1px solid #DCE6E0", borderRadius: 9, padding: 10, marginTop: 5, boxSizing: "border-box" }} placeholder="Record how the invoice and settlement account were independently verified…" /></label>
          <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "#64748B" }}>This action succeeds only if this exact number/network already has an active verified partner destination profile under Payment Provider Limits.</p>
          <button disabled={busy || !reference.trim() || note.trim().length < 20} onClick={() => void verify()} style={{ ...button, width: "100%", opacity: busy || !reference.trim() || note.trim().length < 20 ? .55 : 1 }}>{busy ? "Verifying…" : "Verify invoice & payee"}</button>
        </>}
      </AdminCard>
    </div>
  </AdminLayout>;
}
