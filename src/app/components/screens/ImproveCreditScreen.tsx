import { ArrowLeft, CheckCircle, Clock, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const TIPS = [
  { done: true, title: "Pay loans on time", impact: "+High", desc: "Every on-time payment boosts your score. Never miss a due date.", icon: "✓" },
  { done: true, title: "Keep utilization below 30%", impact: "+High", desc: "Currently at 32%. Paying down your balance will help.", icon: "📊" },
  { done: false, title: "Build a longer credit history", impact: "+Medium", desc: "Continue borrowing responsibly. History length improves over time.", icon: "📅" },
  { done: false, title: "Enable Auto-Save", impact: "+Medium", desc: "Regular savings deposits signal financial discipline to our scoring model.", icon: "🐷" },
  { done: false, title: "Avoid multiple loan applications", impact: "+Low", desc: "Multiple applications in a short period can lower your score temporarily.", icon: "📋" },
  { done: true, title: "Complete full KYC verification", impact: "+Low", desc: "Your identity is fully verified. This adds trust to your profile.", icon: "🆔" },
];

export function ImproveCreditScreen({ onNavigate }: Props) {
  const done = TIPS.filter((t) => t.done).length;

  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("credit-dashboard")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Improve Credit Score</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Progress */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Star size={20} color="#F59E0B" fill="#F59E0B" />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{done} of {TIPS.length} actions completed</span>
          </div>
          <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4 }}>
            <div style={{ width: `${(done / TIPS.length) * 100}%`, height: "100%", background: "#F59E0B", borderRadius: 4 }} />
          </div>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "8px 0 0" }}>Complete all actions to maximize your credit score potential.</p>
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
                <span style={{ fontSize: 10, fontWeight: 700, color: tip.impact === "+High" ? "#178654" : tip.impact === "+Medium" ? "#F59E0B" : "#9CA3AF", background: "#F3F4F6", padding: "2px 6px", borderRadius: 6 }}>{tip.impact}</span>
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
