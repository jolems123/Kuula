import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  BadgeCheck,
  Smartphone,
  History,
  TrendingUp,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditPass } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (screen: string) => void; }

function signalLabel(value: unknown) { return value ? "Verified / recorded" : "Not yet assessed"; }
function signalColor(value: unknown) { return value ? "#0B5E3A" : "#9B6F15"; }

export function CreditPassScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const [pass, setPass] = useState<CreditPass | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!state.session.token) return;
    api.creditPass(state.session.token, "UG")
      .then(({ creditPass }) => setPass(creditPass))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your Credit Pass."));
  }, [state.session.token]);

  const signals = pass?.signals ?? {};
  const checks = [
    { label: "Identity", detail: "Phone and KYC", value: Boolean(signals.identityVerified), icon: BadgeCheck, action: "profile" },
    { label: "Mobile Money history", detail: `${Number(signals.mobileMoneyMonths ?? 0)} verified months`, value: Boolean(signals.mobileMoneyEvidence), icon: Smartphone, action: "credit-breakdown" },
    { label: "Kuula repayment history", detail: Number(signals.loansTotal ?? 0) === 0 ? "New borrower — no history yet" : `${Number(signals.loansRepaid ?? 0)} of ${Number(signals.loansTotal ?? 0)} repaid on time`, value: Number(signals.loansTotal ?? 0) > 0 && Number(signals.loansRepaid ?? 0) > 0, icon: History, action: "loan-history" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F4F7F5" }}>
      <header className="kx-credit-pass__hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="kx-credit-pass__back" onClick={() => onNavigate("home")} aria-label="Back"><ArrowLeft size={19} /></button>
          <div>
            <div className="kx-credit-pass__eyebrow">YOUR KUULA CREDIT PROFILE</div>
            <h1 className="kx-credit-pass__title">Kuula Credit Pass</h1>
          </div>
        </div>

        <div className="kx-credit-pass__score">
          <div>
            <div className="kx-credit-pass__score-label">Internal evidence score</div>
            <div className="kx-credit-pass__score-value">{pass?.score ?? "—"}<span> / {pass?.maxScore ?? 850}</span></div>
            <div className="kx-credit-pass__tier">{pass?.tier ?? "Building"} · Not a bureau score</div>
          </div>
          <div className="kx-credit-pass__badge"><ShieldCheck size={28} /></div>
        </div>
      </header>

      <main className="kx-credit-pass__content">
        {error && <div role="alert" style={{ background: "#FFF1F1", color: "#9E3737", borderRadius: 13, padding: 12, fontSize: 12 }}>{error}</div>}

        <section style={{ background: "white", border: "1px solid #E1E9E4", borderRadius: 18, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 42, height: 42, borderRadius: 14, background: "#EAF5EF", display: "grid", placeItems: "center", color: "#0B5E3A" }}><TrendingUp size={21} /></span>
            <div>
              <div style={{ fontSize: 11, color: "#768279", fontWeight: 700 }}>REPAYMENT RATE</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: "#15271D" }}>{Number(signals.loansTotal ?? 0) > 0 ? `${pass?.repaymentRate ?? 0}%` : "New borrower"}</div>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#68776E" }}>This provisional Kuula score uses verified identity, reviewed mobile money evidence (where available) and Kuula repayment records. Missing data earns no assumed points. Business cash flow and affordability are reviewed separately before any credit decision. No CRB report is used.</p>
        </section>

        <h2 style={{ margin: "20px 0 10px", fontSize: 16, color: "#18271E" }}>What builds your Credit Pass</h2>
        <section style={{ background: "white", border: "1px solid #E1E9E4", borderRadius: 18, overflow: "hidden" }}>
          {checks.map((check, index) => {
            const Icon = check.icon;
            return (
              <button key={check.label} onClick={() => onNavigate(check.action)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 14, border: 0, borderTop: index ? "1px solid #EDF1EF" : "none", background: "white", textAlign: "left" }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: check.value ? "#EAF5EF" : "#FFF7DA", color: signalColor(check.value), display: "grid", placeItems: "center" }}><Icon size={20} /></span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", color: "#1B2A21", fontSize: 13 }}>{check.label}</strong>
                  <span style={{ display: "block", color: "#77847C", fontSize: 10.5, marginTop: 2 }}>{check.detail}</span>
                  <span style={{ display: "block", color: signalColor(check.value), fontSize: 10, marginTop: 3, fontWeight: 800 }}>{signalLabel(check.value)}</span>
                </div>
                <ChevronRight size={18} color="#8A9990" />
              </button>
            );
          })}
        </section>

        <section style={{ marginTop: 16, borderRadius: 18, background: "#FFF7D8", padding: 16, border: "1px solid #F1E1A3" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><LockKeyhole size={19} color="#806919" /><strong style={{ fontSize: 13, color: "#493E1E" }}>Private by design</strong></div>
          <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#716437" }}>Your Credit Pass is an internal progress indicator, not a CRB rating, guaranteed credit limit or approval. Individual loan decisions require business checks and affordability review.</p>
        </section>
      </main>

      <BottomNav active="credit" onNavigate={onNavigate} />
    </div>
  );
}
