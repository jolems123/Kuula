import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type CreditScore } from "../../api/client";
import { env } from "../../config/env";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const COLORS = ["#12B984", "var(--brand-primary-dark)", "#F59E0B", "#8B5CF6", "#06B6D4"];
const ratingLabel = (pct: number) =>
  pct >= 85 ? "Excellent" : pct >= 70 ? "Very Good" : pct >= 55 ? "Good" : pct >= 40 ? "Fair" : "Needs work";

const FALLBACK = [
  { label: "Payment History", score: 92, weight: "35%", status: "Excellent", color: "#12B984", tip: "You've made all payments on time." },
  { label: "Credit Utilization", score: 68, weight: "30%", status: "Good", color: "var(--brand-primary-dark)", tip: "Using 32% of available credit." },
  { label: "Length of History", score: 45, weight: "15%", status: "Fair", color: "#F59E0B", tip: "Longer history improves your score." },
  { label: "Credit Mix", score: 80, weight: "10%", status: "Very Good", color: "#8B5CF6", tip: "Good mix of loan types." },
  { label: "New Inquiries", score: 90, weight: "10%", status: "Excellent", color: "#12B984", tip: "No recent hard inquiries." },
];

export function CreditBreakdownScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  const [data, setData] = useState<CreditScore | null>(null);

  useEffect(() => {
    if (env.USE_API && token) api.creditScore(token).then(setData).catch(() => {});
  }, [token]);

  // Real five-source breakdown from the scoring engine; static sample otherwise.
  const factors = data
    ? data.factors.map((f, i) => ({
        label: f.label, score: f.ratingPercent, weight: `${f.weightPercent}%`,
        status: ratingLabel(f.ratingPercent), color: COLORS[i % COLORS.length], tip: f.detail,
      }))
    : FALLBACK;
  const headerScore = data?.score ?? state.credit?.score ?? 742;
  const headerTier = data?.tier ?? state.credit?.tier ?? "Excellent";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" }}>
        <button onClick={() => onNavigate("credit-dashboard")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Score Breakdown</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-border))", borderRadius: 14, padding: "14px 16px", border: "1px solid var(--brand-border)" }}>
          <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, margin: 0 }}>Your Credit Score</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: "var(--brand-primary-dark)", margin: "2px 0" }}>{headerScore} / 850</p>
          <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{headerTier} · {data ? "Computed from 5 data sources" : "Top 15% of borrowers"}</p>
        </div>

        {factors.map((f) => (
          <div key={f.label} style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Weight: {f.weight}</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.color, background: `color-mix(in srgb, ${f.color} 8%, transparent)`, padding: "3px 10px", borderRadius: 20 }}>{f.status}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 4 }}>
                <div style={{ width: `${f.score}%`, height: "100%", background: f.color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1F2937", minWidth: 36, textAlign: "right" }}>{f.score}</span>
            </div>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "8px 0 0", lineHeight: 1.5 }}>💡 {f.tip}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
