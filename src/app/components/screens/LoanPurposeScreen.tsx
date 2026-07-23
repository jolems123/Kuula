import { ArrowLeft, ShoppingBag, Stethoscope, GraduationCap, Home, Tractor, Briefcase, Zap, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const PURPOSES = [
  { id: "business", Icon: Briefcase, label: "Business", sub: "Stock, supplies, equipment", color: "#F4612B" },
  { id: "emergency", Icon: Zap, label: "Emergency", sub: "Urgent unexpected needs", color: "#EF4444" },
  { id: "medical", Icon: Stethoscope, label: "Medical", sub: "Hospital, medicine, tests", color: "#12B984" },
  { id: "school", Icon: GraduationCap, label: "School Fees", sub: "Tuition, books, uniforms", color: "#8B5CF6" },
  { id: "home", Icon: Home, label: "Home Repair", sub: "Renovation, furniture", color: "#F59E0B" },
  { id: "farm", Icon: Tractor, label: "Farming", sub: "Seeds, tools, livestock", color: "#065F46" },
  { id: "shopping", Icon: ShoppingBag, label: "Shopping", sub: "Personal purchases", color: "#EC4899" },
  { id: "other", Icon: MoreHorizontal, label: "Other", sub: "Any other purpose", color: "#6B7280" },
];

export function LoanPurposeScreen({ onNavigate }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #F4612B, #D9531F)" }}>
        <button onClick={() => onNavigate("loan-apply")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <div style={{ marginLeft: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Loan Purpose</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Step 2 of 4</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 120px" }}>
        <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 16 }}>What do you need the loan for? This helps us offer better terms.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {PURPOSES.map(({ id, Icon, label, sub, color }) => {
            const active = selected === id;
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                style={{
                  background: active ? "#FFF6EF" : "white",
                  borderRadius: 16, padding: "16px 12px",
                  border: `2px solid ${active ? "#F4612B" : "#F3F4F6"}`,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, textAlign: "left",
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={20} color={active ? "#F4612B" : color} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: active ? "#374151" : "#1F2937", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{sub}</p>
                </div>
                {active && <div style={{ position: "absolute" }} />}
              </button>
            );
          })}
        </div>

        {selected && (
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #A7F3D0" }}>
            <p style={{ fontSize: 12, color: "#065F46", margin: 0 }}>
              ✓ Selected: <strong>{PURPOSES.find((p) => p.id === selected)?.label}</strong>
            </p>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={() => { if (selected) onNavigate("loan-disbursement"); }}
          style={{
            width: "100%", height: 52, borderRadius: 14, cursor: selected ? "pointer" : "not-allowed",
            background: selected ? "linear-gradient(135deg, #F4612B, #D9531F)" : "#E5E7EB",
            color: selected ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
