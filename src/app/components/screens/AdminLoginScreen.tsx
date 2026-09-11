import { Eye, EyeOff, Shield, ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import kuulaLogo from "/kuula-logo-dark.png";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { useTranslation } from "react-i18next";
import { adminLoginLimiter } from "../../lib/rate-limiter";

interface Props { onNavigate: (s: string) => void; }

export function AdminLoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Countdown timer for rate-limit lockout
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1000) { clearInterval(timer); return 0; }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const formatLockout = useCallback((ms: number) => {
    const secs = Math.ceil(ms / 1000);
    if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${secs}s`;
  }, []);

  const resetPw = async () => {
    setError(""); setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter your email above, then tap Forgot Password."); return; }
    try {
      await api.resetPassword(email);
      setNotice("If that email is registered, a password reset link has been sent.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send reset email.");
    }
  };

  const submit = async () => {
    setError("");

    // Client-side rate limiting: 5 attempts per 5 minutes
    const rateCheck = adminLoginLimiter.check();
    if (!rateCheck.allowed) {
      setLockoutRemaining(rateCheck.retryAfterMs);
      setError(`Too many attempts. Try again in ${formatLockout(rateCheck.retryAfterMs)}.`);
      return;
    }

    // Staff authentication is always against the Kuula API. There is no demo
    // or offline admin identity — the portal shows database data only.
    setLoading(true);
    try {
      const s = await api.adminLogin(email.trim().toLowerCase(), pw);
      adminLoginLimiter.reset();
      login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
      onNavigate("admin-dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ position: "relative", minHeight: "100%", background: "linear-gradient(135deg, var(--brand-primary-dark), var(--brand-primary))", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button onClick={() => onNavigate("welcome")} aria-label="Go back" title="Go back" style={{ position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <ArrowLeft size={18} color="white" />
      </button>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 170, maxWidth: "65%", padding: 10, borderRadius: 18, background: "white", boxShadow: "0 12px 30px rgba(0,0,0,0.16)" }}>
            <ImageWithFallback src={kuulaLogo} alt="Kuula" style={{ width: "100%", height: "auto", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: 0, letterSpacing: -0.3 }}>Admin Portal</h1>
            <p style={{ fontSize: 13, color: "#E8F5EC", margin: "4px 0 0" }}>Staff access · Authorized personnel only</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Sign In</h2>
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Enter your staff credentials to continue</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Email Address</label>
              <input aria-label="Email address" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@kuula.ug"
                style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input aria-label="Password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} placeholder="Enter your password"
                  style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 44px 0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
                <button aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer" }}>
                  {show ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
                </button>
              </div>
            </div>
            <button onClick={resetPw} style={{ fontSize: 12, color: "var(--brand-primary)", border: "none", background: "none", cursor: "pointer", textAlign: "right", fontWeight: 600 }}>Forgot Password?</button>
          </div>

          {notice && (
            <p style={{ fontSize: 12, color: "#12B984", margin: "-6px 0 0", textAlign: "center" }}>{notice}</p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#EF4444", margin: "-6px 0 0", textAlign: "center" }}>{error}</p>
          )}

          <button onClick={submit} disabled={loading || lockoutRemaining > 0} style={{ width: "100%", height: 48, borderRadius: 12, background: (loading || lockoutRemaining > 0) ? "#9CA3AF" : "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: (loading || lockoutRemaining > 0) ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(11,107,58,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <><div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Signing in...</> : lockoutRemaining > 0 ? `Locked — ${formatLockout(lockoutRemaining)}` : "Sign In to Admin"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "var(--brand-light)", border: "1px solid var(--brand-border)" }}>
            <Shield size={14} color="var(--brand-primary)" />
            <span style={{ fontSize: 11, color: "#374151" }}>Staff sign-ins are recorded in the audit log</span>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#E8F5EC", textAlign: "center" }}>
          © 2026 Kuula Microfinance Ltd. · UMRA Licensed
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
