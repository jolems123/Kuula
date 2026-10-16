import { useEffect, useState } from "react";
import {
  Bell, BriefcaseBusiness, ClipboardList, CalendarClock,
  ChevronRight, RefreshCw, ArrowUpRight, AlertCircle, type LucideIcon,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditProduct, type NetworkOverview } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { setCreditUseSelection } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }

const ICONS: Record<string, LucideIcon> = { business: BriefcaseBusiness };
const money = (value: number, currency = "UGX") => `${currency} ${Math.round(value).toLocaleString("en-UG")}`;
const STATUS_COPY: Record<string, string> = {
  available: "Ready to use",
  in_use: "Your current facility is using this line",
  identity_required: "Verify your identity to unlock credit",
  data_required: "Refresh your credit data to unlock credit",
};
const statusCopy = (status: string) => STATUS_COPY[status] ?? "Keep building your Credit Pass";

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "short" });
}

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
    onNavigate("loan-apply");
  };

  const currency = overview?.market.currency ?? "UGX";
  const firstName = state.user?.fullName?.split(/\s+/)[0] || "there";
  const line = overview?.growthLine;
  const available = line?.availableLimit ?? 0;
  const total = line?.totalLimit ?? 0;
  const availableShare = total > 0 ? Math.min(100, Math.max(0, (available / total) * 100)) : 0;
  const ready = line?.status === "available";
  
  const products = (overview?.products ?? []).filter((product) => product.category === "business").slice(0, 1);

  return (
    <div className="kx kx-app">
      <div className="kx-app__scroll">
        <div className="kx-home__hero">
          <div className="kx-home__bar">
            <div>
              <p className="kx-home__hello">{greeting()},</p>
              <h1 className="kx-home__name">{firstName}</h1>
            </div>
            <button type="button" className="kx-icon-btn kx-icon-btn--on-dark" aria-label="Notifications" onClick={() => { markNotificationsRead(); onNavigate("notifications"); }}>
              <Bell size={20} strokeWidth={1.75} />
              {state.unreadNotifications > 0 && <span className="kx-icon-btn__dot" />}
            </button>
          </div>

          <section className="kx-line" aria-label="Your Kuula Growth Line">
            <span className="kx-line__label">Available to use</span>
            <div className="kx-line__amount">{loading ? <span className="kx-skeleton" style={{ width: 170, height: 34 }} /> : money(available, currency)}</div>
            <p className={`kx-line__status${ready ? " is-ready" : ""}`}>{loading ? "Checking your line…" : line ? statusCopy(line.status) : "Unavailable right now"}</p>
            <div className="kx-line__meter" aria-hidden="true"><span style={{ width: `${availableShare}%` }} /></div>
            <div className="kx-line__meta">
              <span>Growth Line total</span>
              <strong>{money(total, currency)}</strong>
            </div>
            {line?.status === "identity_required" ? (
              <button type="button" className="kx-btn kx-btn--gold kx-btn--lg kx-btn--block" onClick={() => onNavigate("kyc")}>
                Verify my identity <ArrowUpRight size={18} strokeWidth={2} />
              </button>
            ) : (
              <button type="button" className="kx-btn kx-btn--gold kx-btn--lg kx-btn--block" onClick={() => onNavigate("quick-actions")} disabled={!ready}>
                Use my Growth Line <ArrowUpRight size={18} strokeWidth={2} />
              </button>
            )}
          </section>
        </div>

        <div className="kx-app__body kx-home__body">
          {error && (
            <div className="kx-alert kx-alert--error" role="alert">
              <AlertCircle size={16} />
              <span style={{ flex: 1 }}>{error}</span>
              <button type="button" className="kx-link" onClick={() => void load()} aria-label="Try again"><RefreshCw size={16} /></button>
            </div>
          )}

          <section>
            <div className="kx-section-head">
              <div>
                <h2>Kuula Business</h2>
                <p>Business credit for stock, equipment, working capital and growth.</p>
              </div>
              <button type="button" className="kx-link" onClick={() => onNavigate("quick-actions")}>See all</button>
            </div>
            <div className="kx-uses">
              {loading && products.length === 0 && <div className="kx-use kx-use--loading"><span className="kx-skeleton" style={{ width: 36, height: 36 }} /><span className="kx-skeleton" style={{ width: "70%", height: 14 }} /><span className="kx-skeleton" style={{ width: "50%", height: 12 }} /></div>}
              {!loading && !error && products.length === 0 && (
                <div className="kuula-empty-state" role="status">
                  <strong>No business credit products available yet</strong>
                  <p>Your eligible business loan options will appear here when available. You can check your loan applications in the meantime.</p>
                  <button type="button" className="kx-btn kx-btn--secondary" onClick={() => onNavigate("loan-history")}>
                    View my applications
                  </button>
                </div>
              )}
              {products.map((product) => {
                const Icon = ICONS[product.category] ?? BriefcaseBusiness;
                return (
                  <button key={product.id} type="button" className="kx-use" onClick={() => select(product)}>
                    <span className="kx-use__icon"><Icon size={20} strokeWidth={1.75} /></span>
                    <ChevronRight className="kx-use__go" size={16} strokeWidth={1.75} />
                    <strong>Kuula Business</strong>
                    <span>Up to {money(product.customerLimit, currency)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Account summary belongs on Overview, not under Settings.
              Only show values present in the authenticated customer profile. */}
          <section className="kx-card" aria-label="Account overview" style={{ padding: 16 }}>
            <div className="kx-section-head" style={{ marginBottom: 12 }}>
              <div><h2>Account overview</h2><p>Your recorded Kuula account information</p></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <div><span className="kx-overline">Member since</span>
                <strong style={{ display: "block", marginTop: 4 }}>{state.user?.memberSince && !Number.isNaN(new Date(state.user.memberSince).getTime())
                  ? new Date(state.user.memberSince).toLocaleDateString("en-UG", { month: "short", year: "numeric" }) : "Not available"}</strong>
              </div>
              <div><span className="kx-overline">Loans recorded</span>
                <strong style={{ display: "block", marginTop: 4 }}>{state.loan ? state.loan.totalLoansCount : "Not available"}</strong>
              </div>
            </div>
          </section>

          {overview?.nextPayment && (
            <section className="kx-card kx-due">
              <span className="kx-tile-icon kx-tile-icon--gold"><CalendarClock size={20} strokeWidth={1.75} /></span>
              <div className="kx-due__text">
                <span className="kx-overline">Next payment · {formatDue(overview.nextPayment.dueDate)}</span>
                <strong>{money(overview.nextPayment.amount, currency)}</strong>
              </div>
              <button type="button" className="kx-btn kx-btn--primary kx-btn--sm" onClick={() => onNavigate("make-payment")}>Pay now</button>
            </section>
          )}

          <button type="button" className="kx-card kx-row" onClick={() => onNavigate("credit-dashboard")}>
            <span className="kx-tile-icon"><ShieldCheck size={20} strokeWidth={1.75} /></span>
            <div className="kx-row__text">
              <span className="kx-overline">Kuula Credit Pass</span>
              <div className="kx-pass">
                <strong>{pass ? pass.score : "—"}</strong>
                {pass && <span>/ {pass.maxScore}</span>}
                {pass?.tier && <span className="kx-pill kx-pill--soft">{pass.tier}</span>}
              </div>
              {pass && <div className="kx-pass__meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (pass.score / Math.max(1, pass.maxScore)) * 100)}%` }} /></div>}
            </div>
            <ChevronRight size={18} strokeWidth={1.75} className="kx-row__chevron" />
          </button>

        </div>
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
