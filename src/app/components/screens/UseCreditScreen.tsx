import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, BriefcaseBusiness, CheckCircle2, ChevronRight, Circle, ClipboardList, MapPin, Camera, RefreshCw } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct, type GrowthLine, type LoanApplication } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }
const card: React.CSSProperties = { background: "white", border: "1px solid #DCE7E1", borderRadius: 18, padding: 18 };
const bodyCopy: React.CSSProperties = { fontSize: 12, lineHeight: 1.6, color: "#64766C" };
const money = (value: number) => `UGX ${Math.round(value).toLocaleString("en-UG")}`;

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Submitted · awaiting review", resubmitted: "Resubmitted",
    offered: "Offer available", disbursing: "Disbursement processing",
    approved: "Approved", active: "Active loan", overdue: "Payment overdue",
    paid: "Repaid", rejected: "Declined", failed: "Processing failed",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
const OPEN_STATES = new Set(["pending", "resubmitted", "offered", "disbursing", "approved", "active", "overdue"]);

export function UseCreditScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [line, setLine] = useState<GrowthLine | null>(null);
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = state.session.token;

  const load = async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [catalog, growth, history] = await Promise.all([
        api.creditProducts(token, "UG"),
        api.growthLine(token, "UG"),
        api.getApplications(token),
      ]);
      setProducts(catalog.products.filter(product => product.category === "business"));
      setLine(growth.growthLine);
      setApplications(history.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retrieve your applications.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const product = products[0];
  const open = applications.find(app => OPEN_STATES.has(app.status));
  const identityReady = state.user?.verified === true;
  const canStart = !loading && !error && Boolean(product) && identityReady && !open;
  // A Growth Line is a pre-assessed borrowing limit, not a prerequisite for submitting
  // a business loan for a fresh underwriting decision.
  const hasOffer = (line?.availableLimit ?? 0) > 0 && line?.status === "available";
  const steps = [
    { label: "Verify identity", detail: "Complete identity checks", done: identityReady, icon: CheckCircle2 },
    { label: "Business details", detail: "Ownership, trading activity and address", done: Boolean(open?.businessProfile?.businessName), icon: BriefcaseBusiness },
    { label: "Business location", detail: "Capture GPS or place your business pin on the map", done: Boolean(open?.businessProfile?.latitude != null && open.businessProfile.longitude != null), icon: MapPin },
    { label: "Business evidence", detail: "Premises photos and applicant-at-business photo (next form enhancement)", done: false, icon: Camera },
    { label: "Financial details", detail: "Sales, expenses and other debts", done: Boolean(open?.businessProfile?.monthlySales), icon: ClipboardList },
    { label: "Review and submit", detail: "Confirm and send your application", done: Boolean(open), icon: CheckCircle2 },
    { label: "Credit review", detail: "Kuula staff assess your business", done: Boolean(open && ["offered", "approved", "disbursing", "active", "paid"].includes(open.status)), icon: ClipboardList },
    { label: "Decision", detail: "View the decision or offer", done: Boolean(open && ["offered", "approved", "disbursing", "active", "paid", "rejected"].includes(open.status)), icon: CheckCircle2 },
  ];
  const choose = () => {
    if (!product || !canStart) return;
    setCreditUseSelection({
      productCode: product.code, productName: product.name, category: product.category,
      description: product.description, minAmount: product.minAmount, maxAmount: product.maxAmount,
      customerLimit: product.customerLimit, minTermDays: product.minTermDays, maxTermDays: product.maxTermDays,
      partnerRequired: product.partnerRequired, disbursementMode: product.disbursementMode,
    });
    onNavigate("loan-apply");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ padding: "16px 16px 20px", background: "white", borderBottom: "1px solid #DCE7E1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={() => onNavigate("home")} aria-label="Back to overview"
            style={{ width: 40, height: 40, border: "1px solid #DCE7E1", borderRadius: 13, background: "white", color: "#0B5E3A" }}><ArrowLeft size={19} /></button>
          <div>
            <span style={{ fontSize: 11, color: "#0B5E3A", fontWeight: 800 }}>KUULA BUSINESS CREDIT</span>
            <h1 style={{ margin: 0, fontSize: 23, color: "#142B1E" }}>Borrow for your business</h1>
          </div>
        </div>
        <p style={{ ...bodyCopy, margin: "10px 0 0" }}>Apply for financing, track your application and see what information Kuula needs.</p>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "18px 16px 100px", display: "grid", alignContent: "start", gap: 16 }}>
        {error && <div role="alert" style={{ ...card, color: "#A13A3A", background: "#FFF2F2" }}>
          <AlertCircle size={16} style={{ display: "inline", marginRight: 8 }} />{error}
          <button type="button" onClick={() => void load()} style={{ marginLeft: 12, color: "#0B5E3A", border: 0, background: "transparent", fontWeight: 700 }}><RefreshCw size={14} style={{ display: "inline" }} /> Retry</button>
        </div>}

        <section style={card} aria-label="Business credit product">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ background: "#EAF5EF", color: "#0B5E3A", padding: 12, borderRadius: 13 }}><BriefcaseBusiness size={22} /></span>
            <div><strong style={{ color: "#123A27", fontSize: 17 }}>Kuula Business Loan</strong>
              <p style={{ ...bodyCopy, margin: "3px 0 0" }}>Stock, equipment, working capital and business growth</p></div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {["Stock", "Equipment", "Working capital", "Expansion", "Other"].map(x => <span key={x} style={{ padding: "6px 10px", borderRadius: 20, background: "#F0F7F3", color: "#245B40", fontSize: 11 }}>{x}</span>)}
          </div>
          <p style={{ ...bodyCopy, margin: "12px 0 0" }}>
            {product ? `Product terms: ${product.minTermDays}–${product.maxTermDays} days` : "Product information is not available."}
            {hasOffer ? ` · Pre-assessed available line: ${money(line!.availableLimit)}` : " · No pre-assessed credit line available"}
          </p>
          <p style={{ ...bodyCopy, margin: "6px 0 0" }}>A pre-assessed line is not required to start an application. Approval depends on business review, affordability and verification. The final amount and terms are assessed separately.</p>
          {open ? (
            <button type="button" onClick={() => onNavigate("loan-history")} style={{ width: "100%", marginTop: 14, padding: 14, border: 0, borderRadius: 12, background: "#0B5E3A", color: "white", fontWeight: 700 }}>Track existing application <ChevronRight size={16} style={{ display: "inline", verticalAlign: "middle" }} /></button>
          ) : !identityReady ? (
            <button type="button" onClick={() => onNavigate("kyc")} style={{ width: "100%", marginTop: 14, padding: 14, border: 0, borderRadius: 12, background: "#0B5E3A", color: "white", fontWeight: 700 }}>Complete identity verification <ChevronRight size={16} style={{ display: "inline", verticalAlign: "middle" }} /></button>
          ) : (
            <button type="button" disabled={!canStart} onClick={choose} style={{ width: "100%", marginTop: 14, padding: 14, border: 0, borderRadius: 12, background: canStart ? "#0B5E3A" : "#D7E0DB", color: canStart ? "white" : "#64756B", fontWeight: 700 }}>
              Start business loan application <ChevronRight size={16} style={{ display: "inline", verticalAlign: "middle" }} />
            </button>
          )}
        </section>

        <section style={card} aria-label="Application process">
          <h2 style={{ margin: "0 0 5px", color: "#1A3928", fontSize: 17 }}>Application journey</h2>
          <p style={{ ...bodyCopy, margin: "0 0 15px" }}>Know what comes next. Location-map and photo evidence steps are being added to the application form.</p>
          <div style={{ display: "grid", gap: 11 }}>
            {steps.map((step, index) => {
              const Icon = step.icon;
              return <div key={step.label} style={{ display: "flex", gap: 11, alignItems: "start" }}>
                <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 15, display: "grid", placeItems: "center", background: step.done ? "#E6F5EC" : "#F1F4F2", color: step.done ? "#06754A" : "#708079" }}>
                  {step.done ? <CheckCircle2 size={17} /> : <Icon size={16} />}
                </span>
                <div style={{ flex: 1, borderBottom: index < steps.length - 1 ? "1px solid #EFF2F0" : "none", paddingBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "#1C3528" }}>{index + 1}. {step.label}</strong>
                  <p style={{ ...bodyCopy, margin: "2px 0 0" }}>{step.detail}</p>
                </div>
              </div>;
            })}
          </div>
        </section>

        <section style={card} aria-label="Application requirements">
          <h2 style={{ margin: "0 0 8px", color: "#1A3928", fontSize: 17 }}>Before you apply</h2>
          <p style={{ ...bodyCopy, margin: "0 0 12px" }}>Have your business name, address, trading details, monthly sales, expenses and existing debt information ready.</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: identityReady ? "#06754A" : "#9B6F15", fontSize: 12 }}>
            {identityReady ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            {identityReady ? "Account verification recorded" : "Identity verification is required"}
          </div>
          <p style={{ ...bodyCopy, margin: "10px 0 0" }}>Business map coordinates and premises photos will be collected in the enhanced application flow. No information is marked verified until Kuula checks it.</p>
        </section>

        <section style={card} aria-label="Applications">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "#1A3928" }}>My applications</h2>
            <button type="button" onClick={() => void load()} style={{ background: "none", border: 0, color: "#0B5E3A" }} aria-label="Refresh application history"><RefreshCw size={17} /></button>
          </div>
          {loading ? <p style={bodyCopy}>Loading your loan applications…</p> : applications.length === 0 ? (
            <p style={bodyCopy}>No loan applications recorded yet. Your submitted applications will appear here.</p>
          ) : applications.slice(0, 6).map(app => (
            <button key={app.id} type="button" onClick={() => onNavigate("loan-history")} style={{ width: "100%", background: "white", border: 0, borderTop: "1px solid #EFF2F0", textAlign: "left", padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span><strong style={{ display: "block", fontSize: 13, color: "#173827" }}>{money(app.amount)} · {statusLabel(app.status)}</strong>
                <span style={{ ...bodyCopy, fontSize: 11 }}>Term: {app.termDays} days · {app.purpose}</span></span>
              <ChevronRight size={16} color="#72847A" />
            </button>
          ))}
          {applications.length > 6 && <button type="button" onClick={() => onNavigate("loan-history")} style={{ background: "none", border: 0, color: "#0B5E3A", fontWeight: 700, padding: 9 }}>View all applications</button>}
        </section>
      </main>
      <BottomNav active="borrow" onNavigate={onNavigate} />
    </div>
  );
}
