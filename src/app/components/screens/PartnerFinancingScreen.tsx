import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, FileText, Building2, CheckCircle2 } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { getCreditUseSelection, getPartnerSelection, setCreditUseSelection, setPartnerSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

function money(value: number) { return `UGX ${Math.round(value).toLocaleString("en-UG")}`; }

export function PartnerFinancingScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const selected = getCreditUseSelection();
  const partner = getPartnerSelection();
  const [product, setProduct] = useState<CreditProduct | null>(null);
  const [amount, setAmount] = useState(selected?.minAmount ?? 50_000);
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState(selected?.productName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!state.session.token || !selected) return;
    api.creditProducts(state.session.token, "UG").then(({ products }) => {
      const match = products.find((entry) => entry.code === selected.productCode) ?? null;
      setProduct(match);
      if (match) setAmount(Math.max(match.minAmount, Math.min(match.customerLimit, selected.minAmount || match.minAmount)));
    }).catch(() => {});
  }, [state.session.token, selected?.productCode]);

  const effective = product ?? (selected ? {
    code: selected.productCode,
    name: selected.productName,
    minAmount: selected.minAmount,
    customerLimit: selected.customerLimit,
  } : null);
  const maxAmount = effective ? Math.max(effective.minAmount, effective.customerLimit) : 0;
  const valid = Boolean(effective && partner && reference.trim() && purpose.trim() && amount >= effective.minAmount && amount <= maxAmount);

  const submit = async () => {
    if (!state.session.token || !selected || !partner || !valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.submitPartnerFinancing(state.session.token, {
        marketCode: "UG",
        productCode: selected.productCode,
        partnerCode: partner.partnerCode,
        partnerLocationId: partner.locationId ?? null,
        invoiceReference: reference.trim(),
        purpose: purpose.trim(),
        amount,
        externalReference: `${selected.productCode}-${reference.trim()}`,
      });
      setSuccess({ id: response.request.id, message: response.request.message });
      setCreditUseSelection(null);
      setPartnerSelection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit financing request.");
    } finally { setBusy(false); }
  };

  if (!selected || !partner) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#F5F8F6", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <Building2 size={34} color="#0B5E3A" />
          <h2 style={{ color: "#183025" }}>Choose a product and partner first</h2>
          <button onClick={() => onNavigate("use-credit")} style={{ height: 46, padding: "0 18px", border: 0, borderRadius: 13, background: "#0B5E3A", color: "white", fontWeight: 800 }}>Browse credit uses</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ background: "#0B5E3A", color: "white", padding: "16px 16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("partner-network")} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 13, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white" }}><ArrowLeft size={19} /></button>
          <div><div style={{ fontSize: 11, opacity: .7, fontWeight: 800 }}>RESTRICTED-PURPOSE FINANCING</div><h1 style={{ margin: "2px 0 0", fontSize: 20 }}>{selected.productName}</h1></div>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 96px" }}>
        {success ? (
          <div style={{ background: "white", border: "1px solid #DDE8E2", borderRadius: 20, padding: 22, textAlign: "center" }}>
            <span style={{ width: 58, height: 58, borderRadius: 20, background: "#EAF5EF", color: "#0B5E3A", display: "grid", placeItems: "center", margin: "0 auto" }}><CheckCircle2 size={30} /></span>
            <h2 style={{ margin: "14px 0 6px", color: "#173025", fontSize: 19 }}>Request received</h2>
            <p style={{ margin: 0, color: "#6B7971", fontSize: 12, lineHeight: 1.6 }}>{success.message}</p>
            <div style={{ marginTop: 12, fontSize: 10.5, color: "#8A958E" }}>Reference: {success.id}</div>
            <button onClick={() => onNavigate("home")} style={{ width: "100%", height: 48, border: 0, borderRadius: 14, background: "#0B5E3A", color: "white", fontWeight: 800, marginTop: 18 }}>Back to home</button>
          </div>
        ) : (
          <>
            <section style={{ background: "white", border: "1px solid #DFE8E3", borderRadius: 18, padding: 15 }}>
              <div style={{ fontSize: 10.5, color: "#7B877F", fontWeight: 800 }}>PAYEE</div>
              <div style={{ fontSize: 15, color: "#1A2D22", fontWeight: 900, marginTop: 3 }}>{partner.locationName ?? partner.partnerName}</div>
              <div style={{ fontSize: 11, color: "#6D7A72", marginTop: 3 }}>{partner.partnerName} · Kuula verified partner flow</div>
            </section>

            <section style={{ marginTop: 12, background: "#FFF7D8", border: "1px solid #EFE0A4", borderRadius: 16, padding: 14, display: "flex", gap: 10 }}>
              <ShieldCheck size={20} color="#7B6418" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, color: "#695B2B", fontSize: 11.5, lineHeight: 1.5 }}>Submitting this request does not move money. Kuula must verify the invoice/order, partner and payee, complete underwriting, present an offer, and receive your acceptance before settlement.</p>
            </section>

            <section style={{ marginTop: 14, background: "white", border: "1px solid #DFE8E3", borderRadius: 18, padding: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#53645A" }}>AMOUNT</label>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 7 }}><span style={{ color: "#66756C", fontWeight: 800 }}>UGX</span><input type="number" value={amount} min={effective?.minAmount ?? 0} max={maxAmount} onChange={(e) => setAmount(Math.round(Number(e.target.value)))} style={{ border: 0, outline: 0, fontSize: 28, fontWeight: 900, color: "#0B5E3A", width: "100%", background: "transparent" }} /></div>
              <input type="range" min={effective?.minAmount ?? 0} max={maxAmount || 1} step={10_000} value={Math.min(amount, maxAmount || amount)} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", marginTop: 10, accentColor: "#0B5E3A" }} />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#87928B", fontSize: 10 }}><span>{money(effective?.minAmount ?? 0)}</span><span>Limit {money(maxAmount)}</span></div>
            </section>

            <section style={{ marginTop: 12, background: "white", border: "1px solid #DFE8E3", borderRadius: 18, padding: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#53645A" }}>INVOICE / ORDER / BILL REFERENCE</label>
              <div style={{ position: "relative", marginTop: 8 }}><FileText size={18} color="#74837A" style={{ position: "absolute", left: 13, top: 14 }} /><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-20481" style={{ width: "100%", height: 47, border: "1px solid #DCE6E0", borderRadius: 13, padding: "0 12px 0 42px" }} /></div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#53645A", marginTop: 15 }}>WHAT IS THIS FINANCING FOR?</label>
              <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="Describe the treatment, farm inputs, fees or purchase" style={{ width: "100%", border: "1px solid #DCE6E0", borderRadius: 13, padding: 12, marginTop: 8, resize: "none" }} />
            </section>

            {error && <div role="alert" style={{ marginTop: 12, background: "#FFF1F1", color: "#9C3737", padding: 12, borderRadius: 13, fontSize: 12 }}>{error}</div>}
            <button onClick={() => void submit()} disabled={!valid || busy} style={{ width: "100%", height: 52, border: 0, borderRadius: 15, marginTop: 16, background: valid && !busy ? "#0B5E3A" : "#CAD6CF", color: "white", fontWeight: 900 }}>{busy ? "Submitting…" : "Submit for verification"}</button>
          </>
        )}
      </main>
      <BottomNav active="network" onNavigate={onNavigate} />
    </div>
  );
}
