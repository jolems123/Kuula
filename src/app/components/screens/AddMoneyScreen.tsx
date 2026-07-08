import { ArrowLeft, Lock } from "lucide-react";
import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { env } from "../../config/env";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

const QUICK = [10000, 20000, 50000, 100000, 200000, 500000];

export function AddMoneyScreen({ onNavigate }: Props) {
  const { state, setSavingsBalance } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn");
  const [goal, setGoal] = useState("general");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    setLoading(true);
    // Real deposit that moves the savings balance (and unlocks the loan-rate
    // discount once it crosses the threshold).
    if (env.USE_API && token && amt > 0) {
      try {
        const { balance } = await api.depositSavings(token, amt);
        setSavingsBalance(balance);
      } catch { /* fall through to navigation */ }
      setLoading(false);
      onNavigate("goals");
      return;
    }
    setTimeout(() => { setLoading(false); onNavigate("goals"); }, 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #10B981)" }}>
        <button onClick={() => onNavigate("goals")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Add Money to Savings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Current balance */}
        <div style={{ background: "linear-gradient(135deg, #ECFDF5, #D1FAE5)", borderRadius: 16, padding: "16px", border: "1px solid #A7F3D0", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#059669", fontWeight: 600, margin: 0 }}>Current Savings Balance</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: "#065F46", margin: "4px 0" }}>{ugx(state.savingsBalance)}</p>
          <p style={{ fontSize: 11, color: "#10B981", margin: 0 }}>Earns 5% annual interest{state.savingsBalance >= 100000 ? " · unlocks −5% loan APR" : ""}</p>
        </div>

        {/* Amount */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Amount to Deposit (UGX)</label>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={{ width: "100%", height: 56, borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "0 16px", fontSize: 28, fontWeight: 900, color: "#10B981", background: "#F9FAFB", outline: "none", boxSizing: "border-box", textAlign: "center" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {QUICK.map((a) => (
              <button key={a} onClick={() => setAmount(String(a))} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#F0FDF4", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {ugx(a)}
              </button>
            ))}
          </div>
        </div>

        {/* Goal selector */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Save Towards</label>
          {[
            { id: "general", label: "General Savings", sub: "No specific goal" },
            { id: "school", label: "🎓 School Fees", sub: "UGX 350,000 remaining" },
            { id: "emergency", label: "🛡️ Emergency Fund", sub: "UGX 300,000 remaining" },
          ].map((g) => (
            <button key={g.id} onClick={() => setGoal(g.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `2px solid ${goal === g.id ? "#10B981" : "#E5E7EB"}`, background: goal === g.id ? "#F0FDF4" : "#F9FAFB", cursor: "pointer", marginBottom: 8, textAlign: "left" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{g.label}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{g.sub}</p>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${goal === g.id ? "#10B981" : "#D1D5DB"}`, background: goal === g.id ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {goal === g.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: "white" }} />}
              </div>
            </button>
          ))}
        </div>

        {/* Method */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Pay From</label>
          {[{ id: "mtn", label: "MTN MoMo · +256 770 123 456", logo: "🟡" }, { id: "airtel", label: "Airtel Money · +256 752 987 654", logo: "🔴" }].map((m) => (
            <button key={m.id} onClick={() => setMethod(m.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `2px solid ${method === m.id ? "#10B981" : "#E5E7EB"}`, background: method === m.id ? "#F0FDF4" : "#F9FAFB", cursor: "pointer", marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>{m.logo}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", flex: 1, textAlign: "left" }}>{m.label}</span>
              <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${method === m.id ? "#10B981" : "#D1D5DB"}`, background: method === m.id ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {method === m.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: "white" }} />}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #A7F3D0" }}>
          <Lock size={14} color="#10B981" />
          <span style={{ fontSize: 11, color: "#065F46" }}>Funds earn 5.2% annual interest · Withdraw anytime</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={submit}
          style={{ width: "100%", height: 52, borderRadius: 14, background: Number(amount) > 0 ? "linear-gradient(135deg, #10B981, #059669)" : "#E5E7EB", color: Number(amount) > 0 ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none", cursor: Number(amount) > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          {loading ? <><div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Processing...</> : `Deposit ${amount ? ugx(Number(amount)) : "Amount"}`}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
