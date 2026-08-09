import { useState, useRef } from "react";
import { Shield, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { useAppContext } from "../../context/AppContext";
import { getAdminMfaChallenge, setAdminMfaChallenge } from "../../lib/selection";
import { storeSessionTokens } from "../../lib/session-vault";

interface Props { onNavigate: (s: string) => void; }

export function AdminOTPScreen({ onNavigate }: Props) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { login } = useAppContext();
  useTranslation();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const challenge = getAdminMfaChallenge();

  const handle = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val; setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const code = otp.join("");
  const filled = code.length === 6;

  const verify = async () => {
    if (!filled || busy) return;
    setError(""); setNotice("");
    if (!challenge) { setError("Your verification challenge has expired. Sign in again."); return; }
    if (!env.USE_API && challenge.challengeToken === "demo-only") {
      setAdminMfaChallenge(null);
      onNavigate("admin-dashboard");
      return;
    }
    setBusy(true);
    try {
      const session = await api.verifyAdminMfa(challenge.challengeToken, code);
      const expiresAt = Date.now() + (session.accessExpiresInSeconds ?? 900) * 1000;
      storeSessionTokens({ accessToken: session.token, refreshToken: session.refreshToken, accessExpiresAt: expiresAt });
      login(session.token, session.user, session.credit, session.loan, session.savingsBalance, session.role, session.messages, session.unreadNotifications, expiresAt);
      setAdminMfaChallenge(null);
      onNavigate("admin-dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed. Try again.");
    } finally { setBusy(false); }
  };

  const resend = async () => {
    if (!challenge || busy) return;
    if (!env.USE_API) { setNotice("Demo mode does not send SMS."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await api.resendAdminMfa(challenge.challengeToken);
      setNotice("A new verification code was requested.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not resend the code."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "relative", minHeight: "100%", background: "linear-gradient(135deg, #0B5E3A 0%, #04351F 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button onClick={() => { setAdminMfaChallenge(null); onNavigate("admin-login"); }} aria-label="Go back" title="Go back" style={{ position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <ArrowLeft size={18} color="white" />
      </button>
      <div style={{ width: "100%", maxWidth: 400, background: "white", borderRadius: 20, padding: 36, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: "#EDF8F2", border: "2px solid #B7DEC9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Shield size={36} color="#0B5E3A" strokeWidth={1.5} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Two-Factor Verification</h2>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 8, lineHeight: 1.6 }}>Enter the 6-digit code sent to<br /><strong style={{ color: "#1F2937" }}>{challenge?.destination ?? "your verified staff phone"}</strong></p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {otp.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} value={d}
              onChange={(e) => handle(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
              style={{ width: 48, height: 58, borderRadius: 12, textAlign: "center", fontSize: 24, fontWeight: 800, color: "#1F2937", background: d ? "#EDF8F2" : "#F9FAFB", border: `2px solid ${d ? "#0B5E3A" : "#E5E7EB"}`, outline: "none" }} />
          ))}
        </div>
        {error && <p style={{ margin: 0, fontSize: 12, color: "#B91C1C", textAlign: "center" }}>{error}</p>}
        {notice && <p style={{ margin: 0, fontSize: 12, color: "#0B5E3A", textAlign: "center" }}>{notice}</p>}
        <button onClick={verify} disabled={!filled || busy || !challenge} style={{ width: "100%", height: 50, borderRadius: 12, background: filled && challenge && !busy ? "linear-gradient(135deg, #0B5E3A, #087148)" : "#E5E7EB", color: filled && challenge && !busy ? "white" : "#9CA3AF", fontSize: 15, fontWeight: 700, border: "none", cursor: filled && challenge && !busy ? "pointer" : "not-allowed" }}>
          {busy ? "Verifying…" : "Verify & Continue"}
        </button>
        <button onClick={resend} disabled={busy || !challenge} style={{ fontSize: 13, color: "#0B5E3A", border: "none", background: "none", cursor: "pointer", fontWeight: 600 }}>Resend Code</button>
      </div>
    </div>
  );
}
