import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  HeartPulse,
  Sprout,
  GraduationCap,
  Home,
  ShieldCheck,
  ChevronRight,
  Store,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

const icons: Record<string, typeof Store> = {
  business: BriefcaseBusiness,
  health: HeartPulse,
  agriculture: Sprout,
  education: GraduationCap,
  essentials: Home,
};

function money(value: number) { return `UGX ${Math.round(value).toLocaleString("en-UG")}`; }

export function UseCreditScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [available, setAvailable] = useState(0);
  const [status, setStatus] = useState("building");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!state.session.token) return;
    let active = true;
    Promise.all([
      api.creditProducts(state.session.token, "UG"),
      api.growthLine(state.session.token, "UG"),
    ]).then(([catalog, line]) => {
      if (!active) return;
      setProducts(catalog.products);
      setAvailable(line.growthLine.availableLimit);
      setStatus(line.growthLine.status);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Could not load credit options.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [state.session.token]);

  const choose = (product: CreditProduct) => {
    setCreditUseSelection({
      productCode: product.code,
      productName: product.name,
      category: product.category,
      description: product.description,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      customerLimit: product.customerLimit,
      minTermDays: product.minTermDays,
      maxTermDays: product.maxTermDays,
      partnerRequired: product.partnerRequired,
      disbursementMode: product.disbursementMode,
    });
    onNavigate(product.partnerRequired ? "partner-network" : "loan-apply");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ padding: "16px 16px 20px", background: "#0B5E3A", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("home")} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 13, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white" }}><ArrowLeft size={19} /></button>
          <div>
            <div style={{ fontSize: 11, opacity: .72, fontWeight: 700 }}>KUULA GROWTH LINE</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 21 }}>What do you want to grow?</h1>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: "rgba(255,255,255,.11)", border: "1px solid rgba(255,255,255,.16)" }}>
          <div style={{ fontSize: 11, opacity: .7 }}>Available now</div>
          <div style={{ fontSize: 25, fontWeight: 900, marginTop: 2 }}>{loading ? "—" : money(available)}</div>
          <div style={{ fontSize: 11, opacity: .72, marginTop: 3 }}>{status === "available" ? "Choose a purpose below" : "Your line is not currently available for a new facility"}</div>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 96px" }}>
        <div style={{ padding: 14, border: "1px solid #E4E9E6", background: "white", borderRadius: 16, display: "flex", gap: 11, alignItems: "flex-start" }}>
          <ShieldCheck size={20} color="#0B5E3A" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ fontSize: 12.5, color: "#183025" }}>Purpose-first credit</strong>
            <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#6C7A72", lineHeight: 1.5 }}>Where possible, Kuula pays the verified hospital, school, agro-dealer or supplier directly. That keeps financing tied to the need you chose.</p>
          </div>
        </div>

        {error && <div role="alert" style={{ marginTop: 14, color: "#A13A3A", background: "#FFF1F1", borderRadius: 13, padding: 12, fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
          {products.map((product) => {
            const Icon = icons[product.category] ?? Store;
            const directPayee = product.disbursementMode === "direct_payee";
            const drawable = status === "available" && product.customerLimit >= product.minAmount;
            return (
              <button key={product.id} disabled={!drawable} onClick={() => choose(product)} style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", border: "1px solid #E0E9E4", background: drawable ? "white" : "#F1F3F2", borderRadius: 18, padding: 15, textAlign: "left", opacity: drawable ? 1 : .68 }}>
                <span style={{ width: 48, height: 48, borderRadius: 15, background: drawable ? "#EAF5EF" : "#E5E8E6", color: "#0B5E3A", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={23} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ color: "#172A20", fontSize: 14 }}>{product.name}</strong>
                    {directPayee && <span style={{ fontSize: 9.5, background: "#FFF5C8", color: "#756019", borderRadius: 99, padding: "3px 7px", fontWeight: 800 }}>DIRECT TO PROVIDER</span>}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.4, color: "#748079" }}>{product.description}</p>
                  <div style={{ marginTop: 7, fontSize: 11, color: "#0B5E3A", fontWeight: 800 }}>Up to {money(product.customerLimit)} · {product.minTermDays}–{product.maxTermDays} days</div>
                </div>
                <ChevronRight size={19} color="#829188" />
              </button>
            );
          })}
          {!loading && products.length === 0 && <p style={{ textAlign: "center", fontSize: 12, color: "#7A877F", padding: 20 }}>No credit products are available in this market yet.</p>}
        </div>
      </main>

      <BottomNav active="credit" onNavigate={onNavigate} />
    </div>
  );
}
