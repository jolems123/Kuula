import { Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { useTranslation } from "react-i18next";
import { adminLoginLimiter } from "../../lib/rate-limiter";
import { setAdminMfaChallenge } from "../../lib/selection";
import { storeSessionTokens } from "../../lib/session-vault";
import { AuthLayout } from "../auth/AuthLayout";
import { authRecoveryApi } from "../../api/auth-recovery";

interface Props { onNavigate: (s: string) => void; }

export function AdminLoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  useTranslation();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  // Staff password reset: request a code, then set a new password with it.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

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
    const identifier = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) { setError("Enter your staff email address first, then choose Forgot password."); return; }
    try {
      await api.resetPassword(identifier);
      setResetFor(identifier);
      setNotice("If that account is eligible, a reset code has been sent to its registered email.");
    }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not request a reset."); }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetFor || resetBusy) return;
    setError(""); setNotice("");
    if (!/^\d{6}$/.test(resetCode.trim())) { setError("Enter the 6-digit code from your email."); return; }
    if (resetPassword !== resetConfirm) { setError("The new passwords do not match."); return; }
    setResetBusy(true);
    try {
      const result = await authRecoveryApi.confirmPasswordReset(resetFor, resetCode.trim(), resetPassword);
      setResetFor(null); setResetCode(""); setResetPassword(""); setResetConfirm(""); setPw("");
      setNotice(result.message || "Password updated. Sign in with your new password.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The password could not be reset.");
    } finally {
      setResetBusy(false);
    }
  };

  const finishSession = (s: any) => {
    const expiresAt = Date.now() + (s.accessExpiresInSeconds ?? 900) * 1000;
    if (s.refreshToken) storeSessionTokens({ accessToken: s.token, refreshToken: s.refreshToken, accessExpiresAt: expiresAt });
    login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(""); setNotice("");
    const identifier = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || !pw) { setError("Enter your staff email and password."); return; }
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
        <p>Use your work email address and password.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="kx-field">
          <label className="kx-label" htmlFor="staff-phone">Work email</label>
          <div className={`kx-control${error && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? " is-invalid" : ""}`}>
            <input id="staff-phone" className="kx-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="username" placeholder="you@kuulapp.com" autoFocus />
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

      {resetFor && (
        <form onSubmit={confirmReset} noValidate style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Set a new password</h3>
          <div className="kx-field">
            <label className="kx-label" htmlFor="staff-reset-code">Code from SMS</label>
            <div className="kx-control"><input id="staff-reset-code" className="kx-input" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" /></div>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="staff-reset-password">New password</label>
            <div className="kx-control"><input id="staff-reset-password" className="kx-input" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" /></div>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="staff-reset-confirm">Confirm new password</label>
            <div className="kx-control"><input id="staff-reset-confirm" className="kx-input" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} autoComplete="new-password" /></div>
          </div>
          <div className="kx-auth-row">
            <button type="button" className="kx-link" onClick={() => setResetFor(null)}>Cancel</button>
            <button type="submit" className="kx-btn kx-btn--primary" disabled={resetBusy}>{resetBusy ? "Saving…" : "Set new password"}</button>
          </div>
        </form>
      )}

      <div className="kx-auth-foot">
        <ShieldCheck size={16} />
        <span>We'll email a 6-digit verification code to your registered staff address.</span>
      </div>
    </AuthLayout>
  );
}
