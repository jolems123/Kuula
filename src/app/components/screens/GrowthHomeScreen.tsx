import { useEffect, useState } from "react";
import { Bell, BriefcaseBusiness, HeartPulse, Sprout, GraduationCap, Home, ShieldCheck, CalendarDays, ChevronRight, RefreshCw } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct, type NetworkOverview } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }
const ICONS: Record<string, typeof BriefcaseBusiness> = { business: BriefcaseBusiness, health: HeartPulse, agriculture: Sprout, education: GraduationCap, essentials: Home };
const money = (value: number, currency = "UGX") => `${currency} ${Math.round(value).toLocaleString("en-UG")}`;
const copy = (status: string) => status === "available" ? "Ready to use" : status === "in_use" ? "Your current facility is using this line" : status === "identity_required" ? "Complete identity verification to unlock credit" : status === "data_required" ? "Refresh verified credit data to unlock credit" : "Keep building your Credit Pass";

export function GrowthHomeScreen({ onNavigate }: Props) {
  const { state, markNotificationsRead } = useAppContext();
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = state.session.token;

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try { setOverview(await api.networkOverview(token, "UG")); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your Kuula network profile."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const select = (product: CreditProduct) => {
    setCreditUseSelection({ productCode: product.code, productName: product.name, category: product.category, description: product.description, minAmount: product.minAmount, maxAmount: product.maxAmount, customerLimit: product.customerLimit, minTermDays: product.minTermDays, maxTermDays: product.maxTermDays, partnerRequired: product.partnerRequired, disbursementMode: product.disbursementMode });
    onNavigate(product.partnerRequired ? "partner-network" : "loan-apply");
  };

  const currency = overview?.market.currency ?? "UGX";
  const firstName = state.user?.fullName?.split(/\s+/)[0] || "there";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F5F8F6" }}>
      <header style={{ padding: "18px 18px 25px", color: "white", background: "linear-gradient(155deg,#063C27,#0B5E3A 60%,#137548)", borderRadius: "0 0 28px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 10.5, opacity: .72, fontWeight: 800 }}>KUULA · CREDIT FOR EVERYDAY GROWTH</div><h1 style={{ margin: "5px 0 0", fontSize: 23 }}>Hello, {firstName}</h1></div>
          <button aria-label="Notifications" onClick={() => { markNotificationsRead(); onNavigate("notifications"); }} style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white", position: "relative" }}><Bell size={20} />{state.unreadNotifications > 0 && <span style={{ position: "absolute", width: 8, height: 8, background: "#F2C94C", borderRadius: 99, right: 8, top: 8 }} />}</button>
        </div>
        <div style={{ marginTop: 20, borderRadius: 21, padding: 18, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)" }}>
          <div style={{ fontSize: 11, opacity: .72, fontWeight: 800 }}>YOUR KUULA GROWTH LINE</div>
          <div style={{ marginTop: 5, fontSize: 31, fontWeight: 950 }}>{loading ? "—" : money(overview?.growthLine.availableLimit ?? 0, currency)}</div>
          <div style={{ fontSize: 11.5, opacity: .76, marginTop: 4 }}>{overview ? copy(overview.growthLine.status) : "Loading your capacity…"}</div>
          <div style={{ height: 1, background: "rgba(255,255,255,.16)", margin: "15px 0 11px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ opacity: .7 }}>Total line</span><strong>{money(overview?.growthLine.totalLimit ?? 0, currency)}</strong></div>
          <button onClick={() => onNavigate("quick-actions")} disabled={overview?.growthLine.status !== "available"} style={{ width: "100%", height: 48, marginTop: 15, border: 0, borderRadius: 14, background: overview?.growthLine.status === "available" ? "#F2C94C" : "rgba(255,255,255,.18)", color: overview?.growthLine.status === "available" ? "#173323" : "rgba(255,255,255,.7)", fontWeight: 900 }}>Use my Growth Line</button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "17px 16px 96px" }}>
        {error && <div role="alert" style={{ padding: 12, borderRadius: 13, background: "#FFF1F1", color: "#9D3737", fontSize: 12, display: "flex", justifyContent: "space-between" }}><span>{error}</span><button onClick={() => void load()} style={{ border: 0, background: "transparent", color: "#9D3737" }}><RefreshCw size={17} /></button></div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: error ? 14 : 0 }}><div><h2 style={{ margin: 0, fontSize: 18, color: "#17281E" }}>What are you growing?</h2><p style={{ margin: "4px 0 0", color: "#76837B", fontSize: 11.5 }}>Choose a real-life use for your credit.</p></div><button onClick={() => onNavigate("quick-actions")} style={{ border: 0, background: "transparent", color: "#0B5E3A", fontWeight: 800, fontSize: 11.5 }}>See all</button></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {(overview?.products ?? []).slice(0, 4).map((product) => { const Icon = ICONS[product.category] ?? BriefcaseBusiness; return <button key={product.id} onClick={() => select(product)} style={{ minHeight: 125, textAlign: "left", background: "white", border: "1px solid #E0E9E4", borderRadius: 17, padding: 14 }}><span style={{ width: 38, height: 38, display: "grid", placeItems: "center", background: "#EAF5EF", color: "#0B5E3A", borderRadius: 12 }}><Icon size={20} /></span><strong style={{ display: "block", marginTop: 10, color: "#182A20", fontSize: 12.5 }}>{String(product.metadata?.label ?? product.name)}</strong><span style={{ display: "block", marginTop: 5, color: "#7A867E", fontSize: 10.5 }}>Up to {money(product.customerLimit, currency)}</span></button>; })}
        </div>

        <button onClick={() => onNavigate("credit-dashboard")} style={{ width: "100%", marginTop: 15, background: "white", border: "1px solid #E0E9E4", borderRadius: 18, padding: 15, textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, background: "#FFF7D7", color: "#826716", display: "grid", placeItems: "center" }}><ShieldCheck size={22} /></span>
          <div style={{ flex: 1 }}><div style={{ color: "#78837C", fontSize: 10.5, fontWeight: 800 }}>KUULA CREDIT PASS</div><div style={{ fontSize: 20, fontWeight: 950, color: "#16271D" }}>{overview?.creditPass.score ?? "—"} <span style={{ fontSize: 11.5, color: "#5A6B60" }}>{overview?.creditPass.tier ?? ""}</span></div></div><ChevronRight size={18} color="#829087" />
        </button>

        {overview?.nextPayment && <div style={{ marginTop: 13, padding: 14, borderRadius: 17, border: "1px solid #EFE0A0", background: "#FFFDF4", display: "flex", gap: 11, alignItems: "center" }}><span style={{ width: 41, height: 41, borderRadius: 13, background: "#F2C94C", display: "grid", placeItems: "center" }}><CalendarDays size={19} /></span><div style={{ flex: 1 }}><div style={{ fontSize: 10.5, color: "#7B6A2F", fontWeight: 800 }}>NEXT PAYMENT</div><strong style={{ color: "#32321F" }}>{money(overview.nextPayment.amount, currency)}</strong></div><button onClick={() => onNavigate("make-payment")} style={{ border: 0, background: "#0B5E3A", color: "white", borderRadius: 11, padding: "9px 12px", fontWeight: 800 }}>Pay</button></div>}

        <button onClick={() => onNavigate("quick-actions")} style={{ width: "100%", marginTop: 13, border: 0, borderRadius: 18, background: "#EAF5EF", textAlign: "left", padding: 16 }}><div style={{ color: "#547162", fontSize: 10.5, fontWeight: 800 }}>KUULA PARTNERS</div><strong style={{ display: "block", marginTop: 3, color: "#0A4C30", fontSize: 16 }}>Credit where everyday growth happens</strong><span style={{ display: "block", marginTop: 5, color: "#5B7164", fontSize: 11.5, lineHeight: 1.45 }}>Hospitals, agro-dealers, schools, suppliers and merchants can receive approved financing directly.</span></button>
      </main>
      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
