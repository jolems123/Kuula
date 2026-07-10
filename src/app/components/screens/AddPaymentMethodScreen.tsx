import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const TYPES = [
  { id: "mtn", logo: "🟡", label: "MTN Mobile Money", prefix: "+256 77", placeholder: "XXXXXXX", color: "#F59E0B" },
  { id: "airtel", logo: "🔴", label: "Airtel Money", prefix: "+256 75", placeholder: "XXXXXXX", color: "#EF4444" },
  { id: "stanbic", logo: "🏦", label: "Stanbic Bank", prefix: "Acc:", placeholder: "Account Number", color: "#FF6B35" },
  { id: "dfcu", logo: "🏦", label: "DFCU Bank", prefix: "Acc:", placeholder: "Account Number", color: "#8B5CF6" },
  { id: "equity", logo: "🏦", label: "Equity Bank", prefix: "Acc:", placeholder: "Account Number", color: "#10B981" },
];

export function AddPaymentMethodScreen({ onNavigate }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useTranslation();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const type = TYPES.find((t) => t.id === selected);

  const verify = () => {
    setVerifying(true);
    setTimeout(() => { setVerifying(false); setVerified(true); setName("Amara Nakato"); }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <button onClick={() => onNavigate("wallet")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Add Payment Method</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 13, color: "#6B7280" }}>Select the type of payment method you want to add.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelected(t.id); setVerified(false); setNumber(""); }}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14, border: `2px solid ${selected === t.id ? "#FF6B35" : "#E5E7EB"}`, background: selected === t.id ? "#FFF0E8" : "white", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ fontSize: 28 }}>{t.logo}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: selected === t.id ? "#374151" : "#1F2937", flex: 1 }}>{t.label}</span>
              <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${selected === t.id ? "#FF6B35" : "#D1D5DB"}`, background: selected === t.id ? "#FF6B35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected === t.id && <div style={{ width: 8, height: 8, borderRadius: 4, background: "white" }} />}
              </div>
            </button>
          ))}
        </div>

        {selected && type && (
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{type.label} Number</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", height: 48, padding: "0 12px", background: "#F3F4F6", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{type.prefix}</div>
              <input value={number} onChange={(e) => { setNumber(e.target.value); setVerified(false); }} placeholder={type.placeholder} style={{ flex: 1, height: 48, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 15, color: "#1F2937", background: "#F9FAFB", outline: "none" }} />
            </div>
            {number.length >= 6 && !verified && (
              <button onClick={verify} style={{ height: 42, borderRadius: 10, background: "#FFF0E8", color: "#FF6B35", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
                {verifying ? "Verifying..." : "Verify Number"}
              </button>
            )}
            {verified && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #A7F3D0" }}>
                <CheckCircle size={18} color="#10B981" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#065F46", margin: 0 }}>Account Verified</p>
                  <p style={{ fontSize: 11, color: "#10B981", margin: 0 }}>{name}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button onClick={() => { if (verified) onNavigate("payment-methods-list"); }} style={{ width: "100%", height: 52, borderRadius: 14, background: verified ? "linear-gradient(135deg, #FF6B35, #E05A2B)" : "#E5E7EB", color: verified ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none", cursor: verified ? "pointer" : "not-allowed" }}>
          Add Payment Method
        </button>
      </div>
    </div>
  );
}
