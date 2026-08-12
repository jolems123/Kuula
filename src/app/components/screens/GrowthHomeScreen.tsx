import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  HeartPulse,
  Sprout,
  GraduationCap,
  Home,
  ArrowUpRight,
  ShieldCheck,
  CalendarDays,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct, type NetworkOverview } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

const CATEGORY_ICON: Record<string, typeof BriefcaseBusiness> = {
  business: BriefcaseBusiness,
  health: HeartPulse,
  agriculture: Sprout,
  education: GraduationCap,
  essentials: Home,
};

function money(amount: number, currency = "UGX") {
  return `${currency} ${Math.round(amount).toLocaleString("en-UG")}`;
}

function statusCopy(status: string) {
  if (status === "available") return "Ready to use";
  if (status === "in_use") return "Your current facility is using this line";
  if (status === "identity_required") return "Complete identity verification to unlock credit";
  if (status === "data_required") return "Refresh your verified credit data to unlock credit";
  return "Keep building your Kuula Credit Pass";
}

export function GrowthHomeScreen({ onNavigate }: Props) {
  const { state, markNotificationsRead } = useAppContext();
  const token = state.session.token;
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setOverview(await api.networkOverview(token, "UG"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your Kuula network profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);

  const products = useMemo(() => overview?.products ?? [], [overview]);
  const currency = overview?.market.currency ?? "UGX";
  const firstName = state.user?.fullName?.split(/\s+/)[0] || "there";

  const selectProduct = (product: CreditProduct) => {
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
      <header style={{ background: "linear-gradient(155deg,#063C27,#0B5E3A 58%,#137548)", color: "white", padding: "18px 18px 26px", borderRadius: "0 0 28px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", fontWeight: 600 }}>KUULA · CREDIT FOR EVERYDAY GROWTH</div>
            <h1 style={{ margin: "5px 0 0", fontSize: 23, lineHeight: 1.1 }}>Hello, {firstName}</h1>
          </div>
          <button
            onClick={() => { markNotificationsRead(); onNavigate("notifications"); }}
            aria-label="Notifications"
            style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white", position: "relative" }}
          >
            <Bell size={20} />
            {state.unreadNotifications > 0 && <span style={{ position: "absolute", width: 8, height: 8, borderRadius: 99, background: "#F2C94C", right: 8, top: 8 }} />}
          </button>
        </div>

        <div style={{ marginTop: 22, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.10)", borderRadius: 22, padding: 18, backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", fontWeight: 700 }}>YOUR KUULA GROWTH LINE</div>
              <div style={{ marginTop: 5, fontSize: 31, fontWeight: 900, letterSpacing: -1 }}>
                {loading ? "—" : money(overview?.growthLine.availableLimit ?? 0, currency)}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.78)" }}>
                {overview ? statusCopy(overview.growthLine.status) : "Loading your current capacity…"}
              </div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "#F2C94C", color: "#213224", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <ArrowUpRight size={24} strokeWidth={2.5} />
            </div>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,.16)", margin: "17px 0 13px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
            <span style={{ color: "rgba(255,255,255,.7)" }}>Total line</span>
            <strong>{money(overview?.growthLine.totalLimit ?? 0, currency)}</strong>
          </div>
          <button
            onClick={() => onNavigate("use-credit")}
            disabled={!overview || overview.growthLine.status !== "available"}
            style={{ width: "100%", height: 48, marginTop: 16, border: 0, borderRadius: 14, background: overview?.growthLine.status === "available" ? "#F2C94C" : "rgba(255,255,255,.18)", color: overview?.growthLine.status === "available" ? "#173323" : "rgba(255,255,255,.72)", fontWeight: 800, fontSize: 14 }}
          >
            {overview?.growthLine.status === "available" ? "Use my Growth Line" : "Growth Line not currently drawable"}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "18px 16px 96px" }}>
        {error && (
          <div role="alert" style={{ border: "1px solid #F0B9B9", background: "#FFF1F1", color: "#9B2F2F", borderRadius: 14, padding: 13, fontSize: 12, marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{error}</span>
            <button onClick={() => void load()} aria-label="Retry" style={{ border: 0, background: "transparent", color: "#9B2F2F" }}><RefreshCw size={17} /></button>
          </div>
        )}

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: "#14251B" }}>What are you growing?</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#738077" }}>Use credit for a real need, not just cash.</p>
            </div>
            <button onClick={() => onNavigate("use-credit")} style={{ border: 0, background: "transparent", color: "#0B5E3A", fontSize: 12, fontWeight: 800 }}>See all</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 13 }}>
            {products.slice(0, 4).map((product) => {
              const Icon = CATEGORY_ICON[product.category] ?? BriefcaseBusiness;
              return (
                <button key={product.id} onClick={() => selectProduct(product)} style={{ textAlign: "left", border: "1px solid #E1EAE5", background: "white", borderRadius: 17, padding: 14, minHeight: 128, boxShadow: "0 3px 12px rgba(11,94,58,.045)" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: "#EAF5EF", display: "grid", placeItems: "center", color: "#0B5E3A" }}><Icon size={20} /></span>
                  <strong style={{ display: "block", marginTop: 11, fontSize: 13, color: "#17251D" }}>{String(product.metadata?.label ?? product.name)}</strong>
                  <span style={{ display: "block", marginTop: 4, fontSize: 10.5, lineHeight: 1.35, color: "#79857D" }}>Up to {money(product.customerLimit, currency)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section onClick={() => onNavigate("credit-pass")} style={{ marginTop: 18, background: "white", border: "1px solid #E1EAE5", borderRadius: 18, padding: 16, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 44, height: 44, borderRadius: 15, background: "#FFF7D7", color: "#8A6811", display: "grid", placeItems: "center" }}><ShieldCheck size={22} /></span>
              <div>
                <div style={{ fontSize: 11, color: "#7D877F", fontWeight: 700 }}>KUULA CREDIT PASS</div>
                <div style={{ fontSize: 21, fontWeight: 900, color: "#15251C", marginTop: 1 }}>{overview?.creditPass.score ?? "—"} <span style={{ fontSize: 12, color: "#4B5E52", fontWeight: 700 }}>{overview?.creditPass.tier ?? ""}</span></div>
              </div>
            </div>
            <ChevronRight size={19} color="#789087" />
          </div>
          <p style={{ fontSize: 11.5, color: "#69776E", margin: "12px 0 0", lineHeight: 1.5 }}>Your verified identity, credit evidence and repayment history strengthen one portable Kuula credit profile.</p>
        </section>

        {overview?.nextPayment && (
          <section style={{ marginTop: 14, background: "#FFFDF4", border: "1px solid #EFE2A7", borderRadius: 18, padding: 15 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 42, height: 42, borderRadius: 14, background: "#F2C94C", color: "#3B351E", display: "grid", placeItems: "center" }}><CalendarDays size={20} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#7B6B30", fontWeight: 700 }}>NEXT REPAYMENT</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#2C321F" }}>{money(overview.nextPayment.amount, currency)}</div>
                <div style={{ fontSize: 10.5, color: "#7B765D" }}>Due {new Date(overview.nextPayment.dueDate).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <button onClick={() => onNavigate("make-payment")} style={{ border: 0, borderRadius: 12, background: "#0B5E3A", color: "white", fontWeight: 800, padding: "10px 13px", fontSize: 12 }}>Pay</button>
            </div>
          </section>
        )}

        <section onClick={() => onNavigate("partner-network")} style={{ marginTop: 14, background: "#EAF5EF", borderRadius: 18, padding: 16, cursor: "pointer" }}>
          <div style={{ fontSize: 11, color: "#527061", fontWeight: 800 }}>KUULA PARTNERS</div>
          <h3 style={{ margin: "4px 0", color: "#0A4C30", fontSize: 17 }}>Credit where everyday growth happens</h3>
          <p style={{ margin: 0, color: "#5B7164", fontSize: 11.5, lineHeight: 1.5 }}>Hospitals, agro-dealers, schools, suppliers and merchants can receive approved Kuula financing directly.</p>
        </section>
      </main>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
