import { UiText, uiText, uiLocale } from "../../../i18n/ui-text";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, RefreshCw, AlertCircle, ArrowUpRight, FileText, CreditCard, ShieldCheck } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type NetworkOverview } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (screen: string) => void; }
const money = (amount: number, currency = "UGX") => `${currency} ${Math.round(amount).toLocaleString("en-UG")}`;
const formattedDate = (value: string) => new Date(value).toLocaleDateString(uiLocale(), { day: "numeric", month: "short" });
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }

export function GrowthHomeScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = state.session.token;
  useEffect(() => {
    let active = true;
    if (!token) { setLoading(false); return; }
    setLoading(true); setError("");
    api.networkOverview(token, "UG")
      .then(data => { if (active) setOverview(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to load your credit information."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const currency = overview?.market.currency ?? "UGX";
  const line = overview?.growthLine;
  const firstName = state.user?.fullName?.trim().split(/\s+/)[0] || "there";
  const hasPayment = Boolean(overview?.nextPayment);
  const isReady = line?.status === "available";
  const requiresIdentity = line?.status === "identity_required";
  const requiresData = line?.status === "data_required";
  const statusHeading = requiresIdentity ? "Identity verification needed" : requiresData ? "Credit information needed" : isReady ? "Business credit available" : line?.status === "in_use" ? "Your business facility" : "Your business finance";
  const statusDetail = requiresIdentity ? "Complete your identity verification to continue." : requiresData ? "Review your information before applying." : isReady ? "You can begin a new loan application, subject to assessment." : line?.status === "in_use" ? "Review your existing facility and repayment schedule." : "Apply for business finance or track an existing request.";
  const primaryTarget = requiresIdentity ? "kyc" : line?.status === "in_use" ? "loan-detail" : "loan-apply";
  const primaryLabel = requiresIdentity ? "Review identity verification" : line?.status === "in_use" ? "View loan details" : "Apply for business loan";
  return (
    <div className="kx kx-app kuula-customer-home">
      <div className="kx-app__scroll">
        <header className="kuula-home-heading">
          <div><span className="kuula-home-eyebrow"><UiText text={greeting()} /></span><h1><UiText text="Welcome back" />, {firstName}</h1><p><UiText text="Here is your business finance overview." /></p></div>
          <button className="kuula-home-bell" type="button" aria-label={uiText("View notifications")} onClick={() => onNavigate("notifications")}><Bell size={20} />{state.unreadNotifications > 0 && <span className="kuula-home-bell__dot" />}</button>
        </header>
        <main className="kuula-home-content">
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="kx-link" onClick={() => { setError(""); setLoading(true); api.networkOverview(token!, "UG").then(setOverview).catch(e => setError(String(e))).finally(() => setLoading(false)); }}><RefreshCw size={18}/></button></div>}
          <section className="kuula-home-feature" aria-label={uiText("Loan status and next steps")}>
            <div className="kuula-home-feature__main"><span className="kuula-home-feature__eyebrow"><UiText text="YOUR LOAN STATUS" /></span><h2><UiText text={statusHeading} /></h2><p><UiText text={loading ? "Checking your latest information…" : statusDetail} /></p>
              <div className="kuula-home-feature__actions"><button type="button" className="kuula-home-feature__button" onClick={() => onNavigate(primaryTarget)}><UiText text={primaryLabel} /><ArrowUpRight size={17}/></button><button type="button" className="kuula-home-feature__secondary" onClick={() => onNavigate("loan-history")}><UiText text="Track application" /></button></div>
            </div>
            {line && line.totalLimit > 0 && <div className="kuula-home-feature__amount"><span><UiText text="Available credit limit" /></span><strong>{money(line.availableLimit,currency)}</strong><small><UiText text="Subject to eligibility and review" /></small></div>}
          </section>
          <div className="kuula-home-grid">
            <section className="kuula-home-panel" aria-label={uiText("Quick actions")}><div className="kuula-home-panel__heading"><h2><UiText text="Quick actions" /></h2><p><UiText text="The essentials, all in one place." /></p></div><div className="kuula-home-action-grid">
              <button type="button" onClick={() => onNavigate("loan-apply")}><FileText size={21}/><span><UiText text="Apply for loan" /></span></button>
              <button type="button" onClick={() => onNavigate("loan-history")}><ShieldCheck size={21}/><span><UiText text="Track application" /></span></button>
              <button type="button" onClick={() => onNavigate("make-payment")}><CreditCard size={21}/><span><UiText text="Make payment" /></span></button>
            </div></section>
            <section className="kuula-home-panel" aria-label={uiText("Repayment information")}><div className="kuula-home-panel__heading"><h2><UiText text="Repayments" /></h2><p><UiText text="Your upcoming payment information." /></p></div>
              {overview?.nextPayment ? <div className="kuula-home-repayment"><CalendarClock size={23}/><div><span><UiText text="Next payment" /> · {formattedDate(overview.nextPayment.dueDate)}</span><strong>{money(overview.nextPayment.amount,currency)}</strong></div><button type="button" onClick={() => onNavigate("make-payment")}><UiText text="Pay now" /></button></div> : <p className="kuula-home-empty"><UiText text={loading ? "Loading repayment details…" : "No upcoming payment is currently shown."} /></p>}
            </section>
          </div>
          <section className="kuula-home-panel kuula-home-account" aria-label={uiText("Account overview")}><div className="kuula-home-panel__heading"><h2><UiText text="Account overview" /></h2><p><UiText text="Information recorded on your Kuula account." /></p></div><div className="kuula-home-account__stats">
            <div><span><UiText text="Member since" /></span><strong>{state.user?.memberSince && !Number.isNaN(new Date(state.user.memberSince).getTime()) ? new Date(state.user.memberSince).toLocaleDateString(uiLocale(), {month:"short",year:"numeric"}) : "Not available"}</strong></div>
            <div><span><UiText text="Loans recorded" /></span><strong>{state.loan ? state.loan.totalLoansCount : "Not available"}</strong></div>
          </div></section>
        </main>
      </div>
      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
