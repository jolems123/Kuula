import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  BadgeCheck,
  Smartphone,
  Landmark,
  History,
  TrendingUp,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { BottomNav } from "../BottomNav";
import { api, type CreditPass } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (screen: string) => void; }

function signalLabel(value: unknown) { return value ? "Verified" : "Needs attention"; }
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
    { label: "Credit bureau", detail: String(signals.crbStatus ?? "Not verified"), value: Boolean(signals.crbEvidence), icon: Landmark, action: "credit-breakdown" },
    { label: "Repayment history", detail: `${Number(signals.loansRepaid ?? 0)} of ${Number(signals.loansTotal ?? 0)} completed`, value: Number(signals.loansTotal ?? 0) === 0 ? true : Number(signals.loansRepaid ?? 0) > 0, icon: History, action: "loan-history" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F4F7F5" }}>
      <header style={{ background: "linear-gradient(160deg,#063C27,#0B5E3A)", color: "white", padding: "16px 16px 28px", borderRadius: "0 0 28px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("home")} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 13, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", color: "white" }}><ArrowLeft size={19} /></button>
          <div>
            <div style={{ fontSize: 11, opacity: .7, fontWeight: 800 }}>YOUR FINANCIAL IDENTITY</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 21 }}>Kuula Credit Pass</h1>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: 18, borderRadius: 20, background: "rgba(255,255,255,.11)", border: "1px solid rgba(255,255,255,.15)" }}>
          <div>
            <div style={{ fontSize: 12, opacity: .7 }}>Kuula Score</div>
            <div style={{ fontSize: 38, fontWeight: 950, lineHeight: 1, marginTop: 4 }}>{pass?.score ?? "—"}<span style={{ fontSize: 13, opacity: .65, fontWeight: 700 }}> / {pass?.maxScore ?? 850}</span></div>
            <div style={{ display: "inline-flex", marginTop: 9, padding: "5px 9px", borderRadius: 99, background: "#F2C94C", color: "#263023", fontSize: 11, fontWeight: 900 }}>{pass?.tier ?? "Building"}</div>
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 22, background: "#F2C94C", color: "#233326", display: "grid", placeItems: "center" }}><ShieldCheck size={32} /></div>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "18px 16px 96px" }}>
        {error && <div role="alert" style={{ background: "#FFF1F1", color: "#9E3737", borderRadius: 13, padding: 12, fontSize: 12 }}>{error}</div>}

        <section style={{ background: "white", border: "1px solid #E1E9E4", borderRadius: 18, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 42, height: 42, borderRadius: 14, background: "#EAF5EF", display: "grid", placeItems: "center", color: "#0B5E3A" }}><TrendingUp size={21} /></span>
            <div>
              <div style={{ fontSize: 11, color: "#768279", fontWeight: 700 }}>REPAYMENT RATE</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: "#15271D" }}>{pass?.repaymentRate ?? 0}%</div>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#68776E" }}>Your Credit Pass becomes stronger when Kuula can verify your identity, economic activity and repayment behaviour. Kuula does not need your phone contacts to build this profile.</p>
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
          <p style={{ margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#716437" }}>Your Credit Pass is built from verified information and Kuula repayment history. Sensitive identity and financial evidence remains access-controlled and auditable.</p>
        </section>
      </main>

      <BottomNav active="credit" onNavigate={onNavigate} />
    </div>
  );
}
