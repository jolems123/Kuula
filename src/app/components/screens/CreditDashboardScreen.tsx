import { ArrowLeft, ChevronRight } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { CreditScoreGauge } from "../CreditScoreGauge";
import { useAppContext } from "../../context/AppContext";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function CreditDashboardScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  // Real score computed by the backend from the five data sources. No fallback —
  // if there is no real score we show an explicit empty state instead of a number.
  const credit = state.credit;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <button onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Credit Score</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 90px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Gauge — real score only */}
        {credit ? (
          <div style={{ background: "white", borderRadius: 20, padding: "24px 20px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <CreditScoreGauge score={credit.score} size={200} />
            <p style={{ fontSize: 13, color: "#1F2937", fontWeight: 700, margin: "4px 0 0" }}>{credit.tier}</p>
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: 20, padding: "32px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>No credit score yet</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0" }}>Your score appears here once Kuula has enough activity to compute it.</p>
          </div>
        )}

        {/* Score ranges */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>Score Ranges</p>
          {[
            { label: "Poor", range: "300–499", color: "#EF4444", min: 300, max: 499 },
            { label: "Fair", range: "500–599", color: "#F59E0B", min: 500, max: 599 },
            { label: "Good", range: "600–699", color: "#E05A2B", min: 600, max: 699 },
            { label: "Very Good", range: "700–749", color: "#8B5CF6", min: 700, max: 749 },
            { label: "Excellent", range: "750–850", color: "#10B981", min: 750, max: 850 },
          ].map((band) => {
            const r = { ...band, active: credit ? credit.score >= band.min && credit.score <= band.max : false };
            return (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: r.active ? "#F0FDF4" : "transparent", marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: r.active ? 700 : 500, color: r.active ? "#065F46" : "#374151", flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{r.range}</span>
              {r.active && <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981" }}>You are here</span>}
            </div>
            );
          })}
        </div>

        {/* Actions */}
        {[
          { label: "View Score Breakdown", sub: "See what affects your score", screen: "credit-breakdown" },
          { label: "Improve My Score", sub: "Tips to boost your score", screen: "improve-credit" },
        ].map((a) => (
          <button key={a.label} onClick={() => onNavigate(a.screen)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: "white", border: "1px solid #F3F4F6", boxShadow: "0 2px 4px rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{a.label}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{a.sub}</p>
            </div>
            <ChevronRight size={16} color="#D1D5DB" />
          </button>
        ))}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
