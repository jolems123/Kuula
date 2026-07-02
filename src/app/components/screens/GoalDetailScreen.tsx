import { ArrowLeft, Plus, TrendingUp, Calendar, Edit2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

const HISTORY = [
  { date: "Jun 10, 2026", amount: 50000, type: "deposit" },
  { date: "Jun 3, 2026", amount: 30000, type: "auto-save" },
  { date: "May 25, 2026", amount: 100000, type: "deposit" },
  { date: "May 18, 2026", amount: 30000, type: "auto-save" },
  { date: "May 5, 2026", amount: 50000, type: "deposit" },
];

export function GoalDetailScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const target = 800000;
  const current = 450000;
  const pct = Math.round((current / target) * 100);
  const remaining = target - current;
  const months = 4;
  const monthly = Math.ceil(remaining / months);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #10B981)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("goals")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>🎓 {t("goalDetail.schoolFees")}</span>
        </div>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Edit2 size={16} color="white" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Hero progress */}
        <div style={{ background: "linear-gradient(135deg, #ECFDF5, #D1FAE5)", borderRadius: 16, padding: "20px", border: "1px solid #A7F3D0" }}>
          <p style={{ fontSize: 12, color: "#059669", fontWeight: 600, margin: 0 }}>{t("goalDetail.amountSaved")}</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: "#065F46", margin: "4px 0", letterSpacing: -1 }}>{ugx(current)}</p>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 16px" }}>{t("goalDetail.ofGoal", { amount: ugx(target) })}</p>
          <div style={{ height: 12, background: "rgba(0,0,0,0.08)", borderRadius: 6 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #10B981, #059669)", borderRadius: 6 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "#065F46", fontWeight: 600 }}>{t("goalDetail.pctSaved", { pct })}</span>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("goalDetail.remaining", { amount: ugx(remaining) })}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: t("goalDetail.targetDate"), value: "Oct 2026", Icon: Calendar, color: "#0D5C3A" },
            { label: t("goalDetail.monthlyNeeded"), value: ugx(monthly), Icon: TrendingUp, color: "#10B981" },
            { label: t("goalDetail.autoSave"), value: "UGX 30K/mo", Icon: Plus, color: "#F59E0B" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} style={{ flex: 1, background: "white", borderRadius: 12, padding: "12px 10px", textAlign: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <Icon size={16} color={color} style={{ margin: "0 auto 4px" }} />
              <p style={{ fontSize: 12, fontWeight: 800, color: "#1F2937", margin: 0 }}>{value}</p>
              <p style={{ fontSize: 9, color: "#9CA3AF", margin: "2px 0 0" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Contribution history */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>{t("goalDetail.contributionHistory")}</p>
          {HISTORY.map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < HISTORY.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: h.type === "auto-save" ? "#FFF7ED" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 14 }}>{h.type === "auto-save" ? "🔄" : "💰"}</span>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", margin: 0 }}>{h.type === "auto-save" ? t("goalDetail.autoSave") : t("goalDetail.manualDeposit")}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{h.date}</p>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>+{ugx(h.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6", display: "flex", gap: 10 }}>
        <button onClick={() => onNavigate("add-money")} style={{ flex: 1, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #10B981, #059669)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>
          {t("goals.addMoney")}
        </button>
        <button onClick={() => onNavigate("withdraw-savings")} style={{ flex: 1, height: 50, borderRadius: 14, background: "#F3F4F6", color: "#374151", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>
          {t("goalDetail.withdraw")}
        </button>
      </div>
    </div>
  );
}
