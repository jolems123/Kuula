import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, HeartPulse, Sprout, GraduationCap, Store, MapPin, ShieldCheck, ChevronRight } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type KuulaPartner } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { getCreditUseSelection, setPartnerSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

function iconFor(type: string) {
  if (type.includes("health")) return HeartPulse;
  if (type.includes("agriculture")) return Sprout;
  if (type.includes("school") || type.includes("education")) return GraduationCap;
  if (type.includes("merchant") || type.includes("supplier")) return Store;
  return Building2;
}

function typeForCategory(category?: string) {
  if (category === "health") return "health_network";
  if (category === "agriculture") return "agriculture_network";
  return undefined;
}

export function PartnerNetworkScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const selectedProduct = getCreditUseSelection();
  const [partners, setPartners] = useState<KuulaPartner[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const partnerType = useMemo(() => typeForCategory(selectedProduct?.category), [selectedProduct]);

  useEffect(() => {
    if (!state.session.token) return;
    api.partners(state.session.token, "UG", partnerType)
      .then(({ partners }) => setPartners(partners))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Kuula partners."))
      .finally(() => setLoading(false));
  }, [state.session.token, partnerType]);

  const choosePartner = (partner: KuulaPartner, locationId?: string | null, locationName?: string | null) => {
    setPartnerSelection({ partnerCode: partner.code, partnerName: partner.name, partnerType: partner.partnerType, locationId, locationName });
    onNavigate(selectedProduct ? "partner-financing" : "quick-actions");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ padding: "16px 16px 20px", background: "linear-gradient(155deg,#063C27,#0B5E3A)", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate(selectedProduct ? "quick-actions" : "home")} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 13, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white" }}><ArrowLeft size={19} /></button>
          <div><div style={{ fontSize: 11, opacity: .7, fontWeight: 800 }}>KUULA PARTNERS</div><h1 style={{ margin: "2px 0 0", fontSize: 21 }}>{selectedProduct ? `Use ${selectedProduct.productName}` : "Credit where growth happens"}</h1></div>
        </div>
        <p style={{ margin: "14px 0 0", fontSize: 12, opacity: .78, lineHeight: 1.5 }}>Approved restricted-purpose financing is settled to a verified provider, supplier or merchant—not released as unrestricted cash.</p>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 96px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 13, borderRadius: 15, background: "#FFF7D8", border: "1px solid #EFE0A7" }}><ShieldCheck size={20} color="#7F6719" /><span style={{ fontSize: 11.5, color: "#65582B", lineHeight: 1.4 }}>Kuula verifies the partner, invoice/order and payee before any settlement can proceed.</span></div>
        {error && <div role="alert" style={{ marginTop: 14, background: "#FFF1F1", color: "#9E3737", borderRadius: 13, padding: 12, fontSize: 12 }}>{error}</div>}
        {loading && <p style={{ textAlign: "center", color: "#77857C", fontSize: 12, padding: 28 }}>Loading partner network…</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {partners.map((partner) => {
            const Icon = iconFor(partner.partnerType);
            const locations = partner.locations ?? [];
            return <section key={partner.id} style={{ background: "white", border: "1px solid #DFE9E3", borderRadius: 18, overflow: "hidden" }}>
              <button onClick={() => choosePartner(partner)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 15, border: 0, background: "white", textAlign: "left" }}>
                <span style={{ width: 46, height: 46, borderRadius: 15, background: "#EAF5EF", color: "#0B5E3A", display: "grid", placeItems: "center" }}><Icon size={22} /></span>
                <div style={{ flex: 1 }}><strong style={{ display: "block", color: "#172A20", fontSize: 14 }}>{partner.name}</strong><span style={{ display: "block", marginTop: 3, color: "#76847B", fontSize: 10.5 }}>{partner.settlementMode === "direct_payee" ? "Verified direct-payee financing" : partner.settlementMode}</span><span style={{ display: "block", marginTop: 4, color: "#0B5E3A", fontSize: 10, fontWeight: 800 }}>{String(partner.metadata?.statusLabel ?? "Active Kuula partner")}</span></div><ChevronRight size={18} color="#84948A" />
              </button>
              {locations.length > 0 && <div style={{ borderTop: "1px solid #EDF2EF", padding: "10px 12px" }}>{locations.map((location) => <button key={location.id} onClick={() => choosePartner(partner, location.id, location.name)} style={{ width: "100%", border: 0, background: "#F8FAF9", borderRadius: 12, display: "flex", alignItems: "center", gap: 9, padding: 10, marginTop: 5, textAlign: "left" }}><MapPin size={16} color="#0B5E3A" /><div style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 11.5, color: "#24332A" }}>{location.name}</strong><span style={{ fontSize: 10, color: "#7D8981" }}>{location.district ?? location.country}</span></div><ChevronRight size={15} color="#8B978F" /></button>)}</div>}
            </section>;
          })}
        </div>

        {!loading && partners.length === 0 && <div style={{ marginTop: 18, background: "white", border: "1px solid #E0E8E4", borderRadius: 18, padding: 20, textAlign: "center" }}><Building2 size={28} color="#829188" /><h3 style={{ margin: "10px 0 5px", fontSize: 15, color: "#223129" }}>Partner network is being activated</h3><p style={{ margin: 0, fontSize: 11.5, color: "#76837B", lineHeight: 1.5 }}>This product will only go live after Kuula has approved providers for direct settlement.</p></div>}
      </main>
      <BottomNav active="network" onNavigate={onNavigate} />
    </div>
  );
}
