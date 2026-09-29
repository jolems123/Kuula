import { Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { useTranslation } from "react-i18next";
import { adminLoginLimiter } from "../../lib/rate-limiter";
import { setAdminMfaChallenge } from "../../lib/selection";
import { storeSessionTokens } from "../../lib/session-vault";
import { AuthLayout } from "../auth/AuthLayout";
import { toUgandaPhone } from "../../lib/phone";

interface Props { onNavigate: (s: string) => void; }

export function AdminLoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  useTranslation();
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => setLockoutRemaining((prev) => prev <= 1000 ? 0 : prev - 1000), 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const formatLockout = useCallback((ms: number) => {
    const secs = Math.ceil(ms / 1000);
    return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  }, []);

  const resetPw = async () => {
    setError(""); setNotice("");
    const identifier = toUgandaPhone(phone);
    if (!identifier) { setError("Enter your staff phone number first, then choose Forgot password."); return; }
    try { await api.resetPassword(identifier); setNotice("If that account is eligible, a reset code will be sent to its verified phone."); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not request a reset."); }
  };

  const finishSession = (s: any) => {
    const expiresAt = Date.now() + (s.accessExpiresInSeconds ?? 900) * 1000;
    if (s.refreshToken) storeSessionTokens({ accessToken: s.token, refreshToken: s.refreshToken, accessExpiresAt: expiresAt });
    login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(""); setNotice("");
    const identifier = toUgandaPhone(phone);
    if (!identifier || !pw) { setError("Enter your staff phone number and password."); return; }
    const rateCheck = adminLoginLimiter.check();
    if (!rateCheck.allowed) { setLockoutRemaining(rateCheck.retryAfterMs); setError(`Too many attempts. Try again in ${formatLockout(rateCheck.retryAfterMs)}.`); return; }
    setLoading(true);
    try {
      const result = await api.adminLogin(identifier, pw);
      adminLoginLimiter.reset();
      if ("requiresMfa" in result && result.requiresMfa) {
        setAdminMfaChallenge({ challengeToken: result.challengeToken, destination: result.destination });
        onNavigate("admin-otp");
      } else {
        finishSession(result);
        onNavigate("admin-dashboard");
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : "Sign in failed. Try again."); }
    finally { setLoading(false); }
  };

  const locked = lockoutRemaining > 0;

  return (
    <AuthLayout logoSubtitle="Staff portal" onBack={() => onNavigate("welcome")}>
      <div className="kx-auth-head">
        <h2>Sign in</h2>
        <p>Use the phone number linked to your staff account.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="kx-field">
          <label className="kx-label" htmlFor="staff-phone">Phone number</label>
          <div className={`kx-control${error && !toUgandaPhone(phone) ? " is-invalid" : ""}`}>
            <span className="kx-control__prefix">+256</span>
            <input id="staff-phone" className="kx-input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="username" placeholder="7XX XXX XXX" autoFocus />
          </div>
        </div>

        <div className="kx-field">
          <label className="kx-label" htmlFor="staff-password">Password</label>
          <div className="kx-control">
            <input id="staff-password" className="kx-input" value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" />
            <button type="button" className="kx-control__action" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="kx-auth-row">
          <button type="button" className="kx-link" onClick={() => onNavigate("admin-activate")}>First time? Activate account</button>
          <button type="button" className="kx-link" onClick={resetPw}>Forgot password?</button>
        </div>

        <div className="kx-auth-stack">
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
          {notice && <div className="kx-alert kx-alert--success" role="status"><CheckCircle2 size={16} />{notice}</div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={loading || locked}>
            {loading ? <><span className="kx-spinner" />Checking…</> : locked ? `Locked · ${formatLockout(lockoutRemaining)}` : "Continue"}
          </button>
        </div>
      </form>

      <div className="kx-auth-foot">
        <ShieldCheck size={16} />
        <span>We'll text a 6-digit code to your phone to confirm it's you.</span>
      </div>
    </AuthLayout>
  );
}
