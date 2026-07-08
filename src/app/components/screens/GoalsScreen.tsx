import { ArrowLeft, Plus, TrendingUp, Target, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { SavingsGoal } from "../../api/supabase-service";

interface Props {
  onNavigate: (screen: string) => void;
}

function formatUGX(n: number) {
  return "UGX " + n.toLocaleString("en-UG");
}

const GOAL_COLORS = ["#FF6B35", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];
const GOAL_EMOJIS = ["🎯", "🎓", "🛡️", "📱", "🌾", "💼", "🏦", "🏠", "✈️", "🚗"];

export function GoalsScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newEmoji, setNewEmoji] = useState("🎯");
  const [newColor, setNewColor] = useState(GOAL_COLORS[0]);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { goals: fetched } = await api.getGoals(token);
      setGoals(fetched);
    } catch { /* show empty state */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!token || !newName.trim() || !newTarget) return;
    setCreating(true);
    try {
      const { goal } = await api.createGoal(token, {
        name: newName.trim(),
        emoji: newEmoji,
        target: Number(newTarget),
        color: newColor,
      });
      setGoals((prev) => [...prev, goal]);
      setShowCreate(false);
      setNewName("");
      setNewTarget("");
      setNewEmoji("🎯");
      setNewColor(GOAL_COLORS[0]);
    } catch { /* keep form open */ }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    await api.deleteGoal(token, id).catch(() => load());
  };

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const savingsBalance = state.savingsBalance;

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      <div
        className="flex items-center px-4 pt-4 pb-4"
        style={{ background: "linear-gradient(135deg, #065F46, #10B981)" }}
      >
        <button
          onClick={() => onNavigate("home")}
          style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>
          {t("goals.title")}
        </span>
      </div>

      <div
        className="mx-4 mt-4 p-5 rounded-2xl"
        style={{ background: "linear-gradient(135deg, #ECFDF5, #D1FAE5)", border: "1px solid #A7F3D0" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 12, color: "#059669", fontWeight: 500 }}>{t("goals.totalSavings")}</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#065F46", letterSpacing: -1, marginTop: 2 }}>
              {formatUGX(savingsBalance)}
            </p>
            {totalSaved > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <TrendingUp size={13} color="#10B981" />
                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>
                  {formatUGX(totalSaved)} {t("goals.acrossGoals", { defaultValue: "across goals" })}
                </span>
              </div>
            )}
          </div>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
            <Target size={24} color="white" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ paddingBottom: 100 }}>
        <div className="flex items-center justify-between mb-1">
          <p style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{t("goals.myGoals")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1"
            style={{ padding: "5px 12px", borderRadius: 20, background: "#FFF0E8", border: "none", color: "#FF6B35", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={13} /> {t("goals.newGoal")}
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 14 }}>Loading goals…</p>
          </div>
        )}

        {!loading && goals.length === 0 && !showCreate && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#9CA3AF" }}>
            <Target size={40} color="#D1D5DB" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#6B7280" }}>No savings goals yet</p>
            <p style={{ fontSize: 13 }}>Create a goal to track your progress toward something meaningful.</p>
          </div>
        )}

        {showCreate && (
          <div className="p-4 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>New Goal</p>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Goal Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Emergency Fund"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Target Amount (UGX)</label>
              <input
                type="number"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="e.g. 1000000"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>Emoji</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {GOAL_EMOJIS.map((e) => (
                  <button key={e} onClick={() => setNewEmoji(e)} style={{ fontSize: 18, padding: "4px 8px", borderRadius: 8, border: newEmoji === e ? "2px solid #FF6B35" : "1.5px solid #E5E7EB", background: newEmoji === e ? "#FFF0E8" : "white", cursor: "pointer" }}>{e}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>Color</label>
              <div style={{ display: "flex", gap: 8 }}>
                {GOAL_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: 24, height: 24, borderRadius: 12, background: c, border: newColor === c ? "3px solid #1F2937" : "3px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, height: 40, borderRadius: 10, background: "#F3F4F6", border: "none", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleCreate} disabled={creating || !newName.trim() || !newTarget}
                style={{ flex: 2, height: 40, borderRadius: 10, background: creating ? "#9CA3AF" : "#10B981", border: "none", color: "white", fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}>
                {creating ? "Creating…" : "Create Goal"}
              </button>
            </div>
          </div>
        )}

        {goals.map((goal) => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
          return (
            <div
              key={goal.id}
              className="p-4 rounded-2xl"
              style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span style={{ fontSize: 22 }}>{goal.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{goal.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: goal.color }}>{pct}%</span>
                  <button onClick={() => handleDelete(goal.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
                    <Trash2 size={14} color="#9CA3AF" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between mb-2">
                <span style={{ fontSize: 12, color: "#6B7280" }}>{formatUGX(goal.saved)}</span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("common.of")} {formatUGX(goal.target)}</span>
              </div>
              <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: goal.color, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>

      <BottomNav active="goals" onNavigate={onNavigate} />
    </div>
  );
}
