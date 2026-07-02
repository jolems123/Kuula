import { ArrowLeft, Target, Calendar } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const EMOJIS = ["🎓", "🏠", "🚗", "📱", "🌾", "💊", "✈️", "💼", "🎉", "💡"];

export function CreateGoalScreen({ onNavigate }: Props) {
  const [name, setName] = useState("");
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [emoji, setEmoji] = useState("🎓");
  const [autoSave, setAutoSave] = useState(false);
  const [autoAmt, setAutoAmt] = useState("20000");

  const valid = name.trim() && Number(target) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #10B981)" }}>
        <button onClick={() => onNavigate("goals")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Create New Goal</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Emoji picker */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Choose an Icon</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${emoji === e ? "#10B981" : "#E5E7EB"}`, background: emoji === e ? "#F0FDF4" : "#F9FAFB", fontSize: 22, cursor: "pointer" }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Goal name */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Goal Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. School Fees 2027"
            style={{ width: "100%", height: 48, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Target amount */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Target Amount (UGX)</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#9CA3AF" }}>UGX</span>
            <input
              type="number" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="0"
              style={{ width: "100%", height: 52, borderRadius: 10, border: "1.5px solid #E5E7EB", paddingLeft: 52, paddingRight: 14, fontSize: 22, fontWeight: 800, color: "#10B981", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[200000, 500000, 1000000].map((a) => (
              <button key={a} onClick={() => setTarget(String(a))} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#F0FDF4", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {a >= 1000000 ? `${a / 1000000}M` : `${a / 1000}K`}
              </button>
            ))}
          </div>
        </div>

        {/* Deadline */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
            Target Date <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span>
          </label>
          <div style={{ position: "relative" }}>
            <Calendar size={16} color="#9CA3AF" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: "100%", height: 48, borderRadius: 10, border: "1.5px solid #E5E7EB", paddingLeft: 40, paddingRight: 14, fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Auto-save */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: autoSave ? 12 : 0 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>Auto-Save to this Goal</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Automatically contribute regularly</p>
            </div>
            <button onClick={() => setAutoSave(!autoSave)} style={{ width: 46, height: 26, borderRadius: 13, background: autoSave ? "#10B981" : "#D1D5DB", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: autoSave ? "flex-end" : "flex-start", padding: 3 }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "white" }} />
            </button>
          </div>
          {autoSave && (
            <input type="number" value={autoAmt} onChange={(e) => setAutoAmt(e.target.value)} placeholder="Amount per month (UGX)" style={{ width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
          )}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={() => { if (valid) onNavigate("goal-detail"); }}
          style={{ width: "100%", height: 52, borderRadius: 14, background: valid ? "linear-gradient(135deg, #10B981, #059669)" : "#E5E7EB", color: valid ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none", cursor: valid ? "pointer" : "not-allowed", boxShadow: valid ? "0 4px 12px rgba(16,185,129,0.3)" : "none" }}
        >
          Create Goal
        </button>
      </div>
    </div>
  );
}
