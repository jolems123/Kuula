import { DollarSign, PiggyBank, Send, History, Calculator, FileText, Phone, Gift, X } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const ACTIONS = [
  { Icon: DollarSign, label: "Apply for Loan", color: "#0D5C3A", bg: "#ECF5F0", screen: "loan-apply" },
  { Icon: Send, label: "Make Payment", color: "#10B981", bg: "#F0FDF4", screen: "make-payment" },
  { Icon: PiggyBank, label: "Add to Savings", color: "#F59E0B", bg: "#FFF7ED", screen: "add-money" },
  { Icon: History, label: "Loan History", color: "#8B5CF6", bg: "#F5F3FF", screen: "loan-history" },
  { Icon: Calculator, label: "Loan Calculator", color: "#EF4444", bg: "#FEF2F2", screen: "loan-apply" },
  { Icon: FileText, label: "My Agreement", color: "#06B6D4", bg: "#ECFEFF", screen: "loan-agreement" },
  { Icon: Phone, label: "Contact Support", color: "#10B981", bg: "#F0FDF4", screen: "contact-support" },
  { Icon: Gift, label: "Refer a Friend", color: "#F59E0B", bg: "#FFF7ED", screen: "home" },
];

export function QuickActionsScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Quick Actions</span>
        <button onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={18} color="white" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 100px" }}>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>What would you like to do today?</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {ACTIONS.map(({ Icon, label, color, bg, screen }) => (
            <button
              key={label}
              onClick={() => onNavigate(screen)}
              style={{ background: "white", borderRadius: 16, padding: "18px 14px", border: "1px solid #F3F4F6", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={22} color={color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", textAlign: "left", lineHeight: 1.3 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Recent */}
        <div style={{ marginTop: 20, background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>Recent Actions</p>
          {[
            { text: "Applied for UGX 500,000 loan", time: "2 hours ago", color: "#0D5C3A" },
            { text: "Paid UGX 285,000 instalment", time: "3 days ago", color: "#10B981" },
            { text: "Added UGX 50,000 to savings", time: "1 week ago", color: "#F59E0B" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 10, borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>{item.text}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
