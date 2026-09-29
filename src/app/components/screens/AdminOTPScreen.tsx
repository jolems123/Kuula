import { useState, useRef, type ClipboardEvent, type FormEvent } from "react";
import { MessageSquareText, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { useAppContext } from "../../context/AppContext";
import { getAdminMfaChallenge, setAdminMfaChallenge } from "../../lib/selection";
import { storeSessionTokens } from "../../lib/session-vault";
import { AuthLayout } from "../auth/AuthLayout";

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

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtp(Array.from({ length: 6 }, (_, i) => digits[i] ?? ""));
    refs.current[Math.min(digits.length, 5)]?.focus();
  };

  const code = otp.join("");
  const filled = code.length === 6;

  const verify = async (event?: FormEvent) => {
    event?.preventDefault();
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
      login(session.token, session.user, session.credit, session.loan, session.role, session.messages, session.unreadNotifications, expiresAt);
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
      setNotice("A new verification code is on its way.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not resend the code."); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout logoSubtitle="Staff portal" onBack={() => { setAdminMfaChallenge(null); onNavigate("admin-login"); }} backLabel="Back to sign in">
      <div className="kx-auth-head">
        <div className="kx-auth-head__icon"><MessageSquareText size={22} /></div>
        <h2>Check your phone</h2>
        <p>Enter the 6-digit code we sent to <strong>{challenge?.destination ?? "your staff phone"}</strong>.</p>
      </div>

      <form onSubmit={verify} noValidate>
        <div className="kx-otp" role="group" aria-label="Verification code">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              className={`kx-otp__cell${d ? " is-filled" : ""}`}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              onChange={(e) => handle(i, e.target.value)}
              onPaste={paste}
              onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
            />
          ))}
        </div>

        <div className="kx-auth-stack" style={{ marginTop: 22 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
          {notice && <div className="kx-alert kx-alert--success" role="status"><CheckCircle2 size={16} />{notice}</div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={!filled || busy || !challenge}>
            {busy ? <><span className="kx-spinner" />Verifying…</> : "Verify and sign in"}
          </button>
        </div>
      </form>

      <div className="kx-auth-foot" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span>Didn't get a code?</span>
        <button type="button" className="kx-link" onClick={resend} disabled={busy || !challenge}>Send a new code</button>
      </div>
    </AuthLayout>
  );
}
