import { Eye, EyeOff, Shield, ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { useTranslation } from "react-i18next";
import { adminLoginLimiter } from "../../lib/rate-limiter";
import { setAdminMfaChallenge } from "../../lib/selection";
import { storeSessionTokens } from "../../lib/session-vault";

interface Props { onNavigate: (s: string) => void; }

export function AdminLoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  useTranslation();
  const [show, setShow] = useState(false);
  const [identifier, setIdentifier] = useState("");
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
    if (!identifier.trim()) { setError("Enter your staff phone number above, then tap Forgot Password."); return; }
    try { await api.resetPassword(identifier.trim()); setNotice("If that account is eligible, a reset code will be sent to its verified phone."); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not request a reset."); }
  };

  const finishSession = (s: any) => {
    const expiresAt = Date.now() + (s.accessExpiresInSeconds ?? 900) * 1000;
    if (s.refreshToken) storeSessionTokens({ accessToken: s.token, refreshToken: s.refreshToken, accessExpiresAt: expiresAt });
    login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
  };

  const submit = async () => {
    setError(""); setNotice("");
    const rateCheck = adminLoginLimiter.check();
    if (!rateCheck.allowed) { setLockoutRemaining(rateCheck.retryAfterMs); setError(`Too many attempts. Try again in ${formatLockout(rateCheck.retryAfterMs)}.`); return; }
    setLoading(true);
    try {
      const result = await api.adminLogin(identifier.trim(), pw);
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

  return (
    <div style={{ minHeight: "100%", background: "linear-gradient(160deg, #0B5E3A, #04351F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <button onClick={() => onNavigate("welcome")} aria-label="Go back" style={{ position: "absolute", top: 18, left: 18, width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.20)", display: "grid", placeItems: "center" }}><ArrowLeft size={19} color="white" /></button>
      <div style={{ width: "100%", maxWidth: 430 }}>
        <div style={{ textAlign: "center" }}>
          <img src="/kuula-logo.svg" alt="Kuula" style={{ width: 190, filter: "brightness(0) invert(1)", opacity: .98 }} />
          <h1 style={{ margin: "18px 0 0", fontSize: 25, color: "white", fontWeight: 800 }}>Staff Portal</h1>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,.72)", fontSize: 13 }}>Authorized Kuula personnel only</p>
        </div>
        <div style={{ marginTop: 26, background: "white", borderRadius: 24, padding: 26, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
          <h2 style={{ margin: 0, fontSize: 22, color: "#13251C" }}>Welcome back</h2>
          <p style={{ margin: "5px 0 22px", color: "#68766F", fontSize: 13 }}>Enter your staff credentials to continue</p>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 7 }}>Staff phone number</label>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} type="tel" autoComplete="username" placeholder="+256 7XX XXX XXX" style={{ width: "100%", height: 50, padding: "0 14px" }} />
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", margin: "16px 0 7px" }}>Password</label>
          <div style={{ position: "relative" }}>
            <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" style={{ width: "100%", height: 50, padding: "0 46px 0 14px" }} />
            <button onClick={() => setShow(!show)} aria-label="Show password" style={{ position: "absolute", right: 10, top: 9, width: 32, height: 32, border: 0, background: "transparent" }}>{show ? <EyeOff size={17} color="#68766F" /> : <Eye size={17} color="#68766F" />}</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "11px 0 0" }}>
            <button onClick={() => onNavigate("admin-activate")} style={{ border: 0, background: "transparent", color: "#0B5E3A", fontWeight: 700, fontSize: 12, padding: 0 }}>First time? Activate account</button>
            <button onClick={resetPw} style={{ border: 0, background: "transparent", color: "#0B5E3A", fontWeight: 700, fontSize: 12, padding: 0 }}>Forgot Password?</button>
          </div>
          {notice && <p style={{ fontSize: 12, color: "#15864E", textAlign: "center" }}>{notice}</p>}
          {error && <p style={{ fontSize: 12, color: "#DC4C4C", textAlign: "center" }}>{error}</p>}
          <button onClick={submit} disabled={loading || lockoutRemaining > 0} className="kuula-primary" style={{ width: "100%", height: 52, marginTop: 18 }}>
            {loading ? "Checking credentials…" : lockoutRemaining > 0 ? `Locked — ${formatLockout(lockoutRemaining)}` : "Sign In to Admin"}
          </button>
          <div style={{ marginTop: 16, padding: "11px 12px", borderRadius: 12, background: "#FFF7D8", display: "flex", alignItems: "center", gap: 9 }}><Shield size={15} color="#9B7410" /><span style={{ fontSize: 11, color: "#665218" }}>A server-verified second factor is required before privileged access.</span></div>
        </div>
        <p style={{ margin: "20px 0 0", textAlign: "center", color: "rgba(255,255,255,.60)", fontSize: 10.5 }}>© 2026 Kuula Microfinance Limited</p>
      </div>
    </div>
  );
}
