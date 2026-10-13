import { ArrowLeft, Lock, LogOut, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { digitsOnly, newPinProblem, PIN_LENGTH } from "../../lib/pin";

interface Props { onNavigate: (s: string) => void; }

const card = { background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" } as const;
const input = { width: "100%", height: 46, borderRadius: 10, border: "2px solid #E5E7EB", padding: "0 12px", fontSize: 18, letterSpacing: 6, background: "#F9FAFB", outline: "none", boxSizing: "border-box" } as const;

export function PrivacySecurityScreen({ onNavigate }: Props) {
  const { state, logout } = useAppContext();
  const token = state.session.token;
  const [showChange, setShowChange] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const changePin = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !token) return;
    setError(""); setNotice("");
    if (currentPin.length !== PIN_LENGTH) { setError(`Enter your current ${PIN_LENGTH}-digit PIN.`); return; }
    const problem = newPinProblem(newPin);
    if (problem) { setError(problem); return; }
    if (newPin !== confirmPin) { setError("The new PINs do not match."); return; }
    if (newPin === currentPin) { setError("Choose a PIN different from your current one."); return; }
    setBusy(true);
    try {
      await api.setCredentials(token, { current: currentPin, newPin });
      setCurrentPin(""); setNewPin(""); setConfirmPin(""); setShowChange(false);
      setNotice("Your PIN has been changed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Your PIN could not be changed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    if (busy || !token) return;
    setBusy(true); setError("");
    try {
      await api.signOutAll(token);
      logout();
      onNavigate("welcome");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign out of other devices. Try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("settings")} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Privacy & Security</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", color: "#B91C1C", fontSize: 13 }}>{error}</p>}
        {notice && <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", color: "#166534", fontSize: 13 }}>{notice}</p>}

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: showChange ? 16 : 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F3FAF7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={18} color="#0B5E3A" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>Change PIN</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{PIN_LENGTH}-digit app PIN</p>
            </div>
            <button type="button" onClick={() => { setShowChange(!showChange); setError(""); }} style={{ padding: "6px 12px", borderRadius: 8, background: "#F3FAF7", border: "none", color: "#0B5E3A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {showChange ? "Cancel" : "Change"}
            </button>
          </div>
          {showChange && (
            <form onSubmit={changePin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 12, color: "#6B7280" }}>Current PIN
                <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={PIN_LENGTH} value={currentPin} onChange={(e) => setCurrentPin(digitsOnly(e.target.value))} style={input} />
              </label>
              <label style={{ fontSize: 12, color: "#6B7280" }}>New PIN
                <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_LENGTH} value={newPin} onChange={(e) => setNewPin(digitsOnly(e.target.value))} style={input} />
              </label>
              <label style={{ fontSize: 12, color: "#6B7280" }}>Confirm new PIN
                <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_LENGTH} value={confirmPin} onChange={(e) => setConfirmPin(digitsOnly(e.target.value))} style={input} />
              </label>
              <button type="submit" disabled={busy} style={{ width: "100%", height: 44, marginTop: 4, borderRadius: 10, background: "linear-gradient(135deg, #0B5E3A, #064A2E)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
                {busy ? "Saving…" : "Set New PIN"}
              </button>
            </form>
          )}
        </div>

        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogOut size={18} color="#4F46E5" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>Sign out of all devices</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Use this if you lost a phone or shared your PIN</p>
          </div>
          <button type="button" onClick={() => void signOutEverywhere()} disabled={busy} style={{ padding: "6px 12px", borderRadius: 8, background: "#EEF2FF", border: "none", color: "#4F46E5", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Sign out
          </button>
        </div>

        <div style={card}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>Data & Privacy</p>
          {[
            { label: "View Privacy Policy", target: "customer-privacy-policy" },
            { label: "Terms of Service", target: "customer-terms" },
          ].map((item, i) => (
            <button key={item.target} type="button" onClick={() => onNavigate(item.target)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", border: "none", background: "none", borderBottom: i === 0 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{item.label}</span>
              <span style={{ fontSize: 12, color: "#0B5E3A", fontWeight: 700 }}>View →</span>
            </button>
          ))}
        </div>

        <button onClick={() => onNavigate("delete-account")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 14, background: "#FEF2F2", border: "1px solid #FECACA", cursor: "pointer" }}>
          <Trash2 size={18} color="#EF4444" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#EF4444" }}>Delete Account</span>
        </button>
      </div>
    </div>
  );
}
