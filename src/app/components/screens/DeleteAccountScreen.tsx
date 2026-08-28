import { ArrowLeft, AlertTriangle, Trash2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const CONFIRM_WORD = "DELETE";

/**
 * In-app account deletion — required by Apple guideline 5.1.1(v) and Google
 * Play's account-deletion policy. Calls POST /api/users/me/delete (Node) or
 * the Supabase soft-delete path, then ends the local session.
 */
export function DeleteAccountScreen({ onNavigate }: Props) {
  const { state, logout } = useAppContext();
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canDelete = acknowledged && confirmText.trim().toUpperCase() === CONFIRM_WORD && !submitting;

  const handleDelete = async () => {
    if (!canDelete) return;
    const token = state.session.token;
    if (!token) { logout(); onNavigate("welcome"); return; }

    setSubmitting(true);
    setError("");
    try {
      await api.deleteAccount(token);
      logout();
      onNavigate("welcome");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Deletion failed. Try again or contact support.");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}>
        <button onClick={() => onNavigate("privacy-security")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Delete Account</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 16, padding: 16, display: "flex", gap: 12 }}>
          <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B", margin: 0 }}>This is permanent</p>
            <p style={{ fontSize: 12, color: "#B91C1C", margin: "4px 0 0", lineHeight: 1.6 }}>
              Deleting your account erases your profile, saved payment methods and notification
              history. This cannot be undone.
            </p>
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 10 }}>Before you go</p>
          {[
            "Any active loan must be fully repaid before deletion can complete.",
            "Some records are kept where Ugandan financial regulations require it (UMRA/AML retention periods).",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0" }}>
              <ShieldCheck size={15} color="#6B7280" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, color: "#4B5563", lineHeight: 1.55 }}>{t}</span>
            </div>
          ))}
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "white", borderRadius: 16, padding: 16, boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer" }}>
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: "#DC2626" }} />
          <span style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.55 }}>
            I understand my account and personal data will be permanently deleted and I will lose
            access to my credit history with Kuula.
          </span>
        </label>

        <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            Type <span style={{ fontWeight: 800, color: "#DC2626" }}>{CONFIRM_WORD}</span> to confirm
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            style={{ width: "100%", height: 46, borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 15, letterSpacing: 2, fontWeight: 700, color: "#1F2937", outline: "none", boxSizing: "border-box" }}
          />
        {error && <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0" }}>{error}</p>}
        </div>

        <button
          onClick={handleDelete}
          disabled={!canDelete}
          style={{
            width: "100%", height: 50, borderRadius: 14, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: canDelete ? "linear-gradient(135deg, #DC2626, #B91C1C)" : "#E5E7EB",
            color: canDelete ? "white" : "#9CA3AF",
            fontSize: 15, fontWeight: 700, cursor: canDelete ? "pointer" : "not-allowed",
          }}
        >
          <Trash2 size={17} />
          {submitting ? "Deleting…" : "Permanently Delete Account"}
        </button>

        <button onClick={() => onNavigate("privacy-security")} style={{ width: "100%", height: 46, borderRadius: 14, background: "white", border: "1.5px solid #E5E7EB", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Keep My Account
        </button>
      </div>
    </div>
  );
}
