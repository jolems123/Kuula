import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

function money(value: number) { return `UGX ${Math.round(value).toLocaleString("en-UG")}`; }

export function UseCreditScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const [products, setProducts] = useState<CreditProduct[]>([]);
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
      setProducts(catalog.products.filter((product) => product.category === "business"));
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
    onNavigate("loan-apply");
  };

  const product = products[0];
  const drawable = status === "available" && Boolean(product && product.customerLimit >= product.minAmount);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ padding: "16px 16px 18px", background: "white", color: "#13251C", borderBottom: "1px solid #DCE7E1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("home")} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 13, border: "1px solid #DCE7E1", background: "white", color: "#0B5E3A" }}><ArrowLeft size={19} /></button>
          <div>
            <div style={{ fontSize: 11, color: "#0B5E3A", fontWeight: 700 }}>BUSINESS CREDIT</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 21 }}>Kuula Business</h1>
          </div>
        </div>
        <p style={{ margin: "12px 0 0", color: "#68766F", fontSize: 13, lineHeight: 1.5 }}>Business financing for stock, equipment, working capital and growth.</p>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 96px" }}>
        <div style={{ padding: 16, border: "1px solid #DCE7E1", background: "white", borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 42, height: 42, borderRadius: 13, background: "#EAF5EF", color: "#0B5E3A", display: "grid", placeItems: "center" }}><BriefcaseBusiness size={22} /></span>
            <div>
              <strong style={{ display: "block", fontSize: 15, color: "#183025" }}>Business loan</strong>
              <span style={{ display: "block", marginTop: 3, color: "#68766F", fontSize: 11 }}>For eligible business owners and operators</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}>
            {["Stock and inventory", "Equipment and tools", "Working capital", "Business expansion", "Other"].map((purpose) => (
              <span key={purpose} style={{ padding: "6px 9px", borderRadius: 99, background: "#F3FAF7", color: "#245B40", fontSize: 10.5, fontWeight: 600 }}>{purpose}</span>
            ))}
          </div>
          {product && <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "#68766F" }}>Available credit up to {money(product.customerLimit)} · {product.minTermDays}–{product.maxTermDays} days</p>}
          {!product && !loading && <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "#68766F" }}>Your business credit offer is being set up. Please try again later.</p>}
          {status !== "available" && <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#68766F" }}>{loading ? "Checking your available credit…" : "Your Growth Line is not currently available for a new application."}</p>}
          {error && <div role="alert" style={{ marginTop: 14, color: "#A13A3A", background: "#FFF1F1", borderRadius: 13, padding: 12, fontSize: 12 }}>{error}</div>}
          <button type="button" disabled={!drawable} onClick={() => product && choose(product)} style={{ width: "100%", marginTop: 16, minHeight: 48, border: 0, borderRadius: 12, background: drawable ? "#0B5E3A" : "#D7E0DB", color: drawable ? "white" : "#64756B", fontSize: 14, fontWeight: 700 }}>
            Apply for business credit <ChevronRight size={17} style={{ display: "inline", verticalAlign: "middle", marginLeft: 6 }} />
          </button>
        </div>
      </main>

      <BottomNav active="borrow" onNavigate={onNavigate} />
    </div>
  );
}
