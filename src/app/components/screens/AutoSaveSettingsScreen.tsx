import { ArrowLeft, RefreshCw, Calendar, PiggyBank } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

export function AutoSaveSettingsScreen({ onNavigate }: Props) {
  const [enabled, setEnabled] = useState(true);
  const { t } = useTranslation();
  const [freq, setFreq] = useState("weekly");
  const [amount, setAmount] = useState("30000");
  const [day, setDay] = useState("Monday");
  const [source, setSource] = useState("mtn");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #10B981)" }}>
        <button onClick={() => onNavigate("goals")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Auto-Save Settings</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Master toggle */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={20} color="#10B981" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>Auto-Save</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Save automatically on schedule</p>
            </div>
          </div>
          <button onClick={() => setEnabled(!enabled)} style={{ width: 50, height: 28, borderRadius: 14, background: enabled ? "#10B981" : "#D1D5DB", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: enabled ? "flex-end" : "flex-start", padding: 3 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
          </button>
        </div>

        {enabled && (
          <>
            {/* Frequency */}
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Frequency</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["daily", "weekly", "monthly"].map((f) => (
                  <button key={f} onClick={() => setFreq(f)} style={{ flex: 1, height: 38, borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: freq === f ? "#10B981" : "#F3F4F6", color: freq === f ? "white" : "#6B7280", textTransform: "capitalize" }}>{f}</button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Amount per {freq === "daily" ? "day" : freq === "weekly" ? "week" : "month"} (UGX)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%", height: 50, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 16px", fontSize: 22, fontWeight: 800, color: "#10B981", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {[10000, 20000, 50000].map((a) => (
                  <button key={a} onClick={() => setAmount(String(a))} style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "none", background: "#F0FDF4", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{ugx(a)}</button>
                ))}
              </div>
            </div>

            {/* Day */}
            {freq === "weekly" && (
              <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Save On</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <button key={d} onClick={() => setDay(d)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: day === d ? "#10B981" : "#F3F4F6", color: day === d ? "white" : "#6B7280" }}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Source */}
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Deduct From</label>
              {[{ id: "mtn", label: "MTN MoMo · +256 770 123 456", logo: "🟡" }, { id: "airtel", label: "Airtel Money · +256 752 987 654", logo: "🔴" }].map((m) => (
                <button key={m.id} onClick={() => setSource(m.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `2px solid ${source === m.id ? "#10B981" : "#E5E7EB"}`, background: source === m.id ? "#F0FDF4" : "#F9FAFB", cursor: "pointer", marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{m.logo}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", flex: 1, textAlign: "left" }}>{m.label}</span>
                  <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${source === m.id ? "#10B981" : "#D1D5DB"}`, background: source === m.id ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {source === m.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: "white" }} />}
                  </div>
                </button>
              ))}
            </div>

            {/* Summary */}
            <div style={{ background: "#F0FDF4", borderRadius: 14, padding: "14px", border: "1px solid #A7F3D0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <PiggyBank size={16} color="#10B981" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#065F46" }}>Auto-Save Summary</span>
              </div>
              <p style={{ fontSize: 12, color: "#065F46", margin: 0, lineHeight: 1.7 }}>
                Every <strong>{day || "Monday"}</strong>, <strong>{ugx(Number(amount) || 0)}</strong> will be moved from your MTN MoMo to your Kuula savings. Estimated monthly: <strong>{ugx(freq === "daily" ? Number(amount) * 30 : freq === "weekly" ? Number(amount) * 4 : Number(amount))}</strong>.
              </p>
            </div>
          </>
        )}
      </div>

      <div style={{ padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("goals")} style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #10B981, #059669)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer" }}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
