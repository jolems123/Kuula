import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

export function WithdrawSavingsScreen({ onNavigate }: Props) {
  const [amount, setAmount] = useState("");
  const { t } = useTranslation();
  const [dest, setDest] = useState("mtn");
  const [loading, setLoading] = useState(false);
  const balance = 850000;
  const num = Number(amount);
  const valid = num > 0 && num <= balance;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #10B981)" }}>
        <button onClick={() => onNavigate("goals")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Withdraw Savings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "linear-gradient(135deg, #ECFDF5, #D1FAE5)", borderRadius: 16, padding: "16px", border: "1px solid #A7F3D0" }}>
          <p style={{ fontSize: 12, color: "#059669", fontWeight: 600, margin: 0 }}>Available to Withdraw</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: "#065F46", margin: "4px 0" }}>{ugx(balance)}</p>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Withdrawal Amount (UGX)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount"
            style={{ width: "100%", height: 56, borderRadius: 12, border: `1.5px solid ${num > balance ? "#EF4444" : "#E5E7EB"}`, padding: "0 16px", fontSize: 26, fontWeight: 900, color: num > balance ? "#EF4444" : "#10B981", background: "#F9FAFB", outline: "none", boxSizing: "border-box", textAlign: "center" }} />
          {num > balance && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>Exceeds available balance</p>}
          <button onClick={() => setAmount(String(balance))} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "none", background: "#F0FDF4", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Withdraw All</button>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Send To</label>
          {[{ id: "mtn", label: "MTN MoMo", number: "+256 770 123 456", logo: "🟡" }, { id: "airtel", label: "Airtel Money", number: "+256 752 987 654", logo: "🔴" }, { id: "bank", label: "Stanbic Bank", number: "Acc: ****4532", logo: "🏦" }].map((m) => (
            <button key={m.id} onClick={() => setDest(m.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `2px solid ${dest === m.id ? "#10B981" : "#E5E7EB"}`, background: dest === m.id ? "#F0FDF4" : "#F9FAFB", cursor: "pointer", marginBottom: 8, textAlign: "left" }}>
              <span style={{ fontSize: 22 }}>{m.logo}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{m.number}</p>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${dest === m.id ? "#10B981" : "#D1D5DB"}`, background: dest === m.id ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {dest === m.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: "white" }} />}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#92400E", margin: 0, lineHeight: 1.6 }}>
            Withdrawing savings may affect your credit score. Withdrawals are processed within 2 hours.
          </p>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={() => { if (valid) { setLoading(true); setTimeout(() => { setLoading(false); onNavigate("goals"); }, 1800); } }}
          style={{ width: "100%", height: 52, borderRadius: 14, background: valid ? "linear-gradient(135deg, #10B981, #059669)" : "#E5E7EB", color: valid ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none", cursor: valid ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          {loading ? <><div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Processing...</> : `Withdraw ${valid ? ugx(num) : "Amount"}`}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
