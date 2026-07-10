import { ArrowLeft, Smartphone, Building2, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const METHODS = [
  {
    id: "mtn", label: "MTN MoMo", sub: "Instant to +256 77X", badge: "Recommended",
    logo: "🟡", color: "#F59E0B", number: "+256 770 123 456",
  },
  {
    id: "airtel", label: "Airtel Money", sub: "Instant to +256 75X",
    logo: "🔴", color: "#EF4444", number: "+256 752 987 654",
  },
  {
    id: "bank", label: "Bank Account", sub: "Stanbic Bank · 2-4 hours",
    logo: "🏦", color: "#FF6B35", number: "Acc: ****4532",
  },
];

export function LoanDisbursementScreen({ onNavigate }: Props) {
  const [selected, setSelected] = useState("mtn");
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <button onClick={() => onNavigate("loan-purpose")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <div style={{ marginLeft: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white", display: "block" }}>Disbursement Method</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Step 3 of 4 — Where to send funds</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 120px", display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, color: "#6B7280" }}>Select where you want to receive your loan disbursement.</p>

        {METHODS.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              style={{
                background: active ? "#FFF0E8" : "white",
                borderRadius: 16, padding: "16px",
                border: `2px solid ${active ? "#FF6B35" : "#F3F4F6"}`,
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 14,
              }}
            >
              <span style={{ fontSize: 32 }}>{m.logo}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: active ? "#374151" : "#1F2937" }}>{m.label}</span>
                  {m.badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", background: "#F0FDF4", padding: "2px 8px", borderRadius: 20 }}>
                      {m.badge}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>{m.sub}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "2px 0 0" }}>{m.number}</p>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${active ? "#FF6B35" : "#D1D5DB"}`, background: active ? "#FF6B35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active && <div style={{ width: 8, height: 8, borderRadius: 4, background: "white" }} />}
              </div>
            </button>
          );
        })}

        <button style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: "white", border: "2px dashed #D1D5DB", cursor: "pointer" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Smartphone size={20} color="#9CA3AF" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6B7280" }}>+ Add new payment method</span>
        </button>

        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF0E8", border: "1px solid #FFDCC8" }}>
          <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>
            ⚡ MTN MoMo and Airtel Money are disbursed <strong>instantly</strong>. Bank transfers take 2–4 business hours.
          </p>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("loan-review")} style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer" }}>
          Continue to Review
        </button>
      </div>
    </div>
  );
}
