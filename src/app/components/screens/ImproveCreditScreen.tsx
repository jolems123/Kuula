import { UiText } from "../../../i18n/ui-text";
import { ArrowLeft, CheckCircle, Clock, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (s: string) => void; }

export function ImproveCreditScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const factors = state.credit?.factors ?? [];
  const kyc = factors.find((f) => f.key === "kyc");
  const momo = factors.find((f) => f.key === "momo");
  const repayment = factors.find((f) => f.key === "repayment");
  const TIPS = [
    { done: kyc?.ratingPercent === 100, title: "Verify your identity", impact: "20%", desc: kyc?.detail ?? "Complete identity verification to build your profile.", icon: "🆔" },
    { done: Boolean(momo?.ratingPercent), title: "Provide verified mobile-money history", impact: "40%", desc: momo?.detail ?? "Unverified activity earns no score points.", icon: "📱" },
    { done: Boolean(repayment?.ratingPercent), title: "Build a Kuula repayment record", impact: "40%", desc: repayment?.detail ?? "New borrowers are not given assumed repayment points.", icon: "✓" },
  ];
  const done = TIPS.filter((t) => t.done).length;

  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("credit-dashboard")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}><UiText text={"Improve Credit Score"} /></span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Progress */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Star size={20} color="#F59E0B" fill="#F59E0B" />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{done}<UiText text={" of "} />{TIPS.length}<UiText text={" actions completed"} /></span>
          </div>
          <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4 }}>
            <div style={{ width: `${(done / TIPS.length) * 100}%`, height: "100%", background: "#F59E0B", borderRadius: 4 }} />
          </div>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "8px 0 0" }}><UiText text={"This shows evidence recorded by Kuula, not a guaranteed approval or a credit bureau report."} /></p>
        </div>

        {/* Tips */}
        {TIPS.map((tip, i) => (
          <div key={i} style={{ background: "white", borderRadius: 16, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", gap: 12, alignItems: "flex-start", border: tip.done ? "1px solid #D1FAE5" : "1px solid #F3F4F6" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: tip.done ? "#F0FDF4" : "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>
              {tip.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{tip.title}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: tip.impact === "40%" ? "#178654" : "#9CA3AF", background: "#F3F4F6", padding: "2px 6px", borderRadius: 6 }}>{tip.impact}</span>
              </div>
              <p style={{ fontSize: 11, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>{tip.desc}</p>
            </div>
            {tip.done
              ? <CheckCircle size={20} color="#178654" style={{ flexShrink: 0 }} />
              : <Clock size={20} color="#D1D5DB" style={{ flexShrink: 0 }} />
            }
          </div>
        ))}
      </div>
    </div>
  );
}
