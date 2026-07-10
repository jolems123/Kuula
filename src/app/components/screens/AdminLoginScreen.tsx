import { Eye, EyeOff, Shield, ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import kuulaLogo from "../../../imports/kuula-tile-1024.png";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useAppContext, type UserProfile } from "../../context/AppContext";
import mockData from "../../data/mockData.json";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
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

    // Real staff authentication via the Kuula API.
    if (env.USE_API) {
      setLoading(true);
      try {
        const s = await api.adminLogin(email, pw);
        adminLoginLimiter.reset();
        login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
        onNavigate("admin-otp");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Sign in failed. Try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo auth exists whenever the API is OFF — including production builds
    // — so the packaged mobile app's admin surface stays fully explorable
    // without a live staff identity API. Flip VITE_USE_API=true to require
    // real staff auth.
    const adminUser = mockData.testUsers.find((u) => u.role === "admin" && u.email === email.trim().toLowerCase());
    if (!adminUser || pw.length < 4) {
      setError("Invalid credentials.");
      return;
    }
    setLoading(true);
    const userProfile: UserProfile = {
      id: adminUser.id,
      role: "admin",
      initials: adminUser.initials,
      fullName: adminUser.fullName,
      phone: adminUser.phone,
      email: adminUser.email,
      nationalId: adminUser.nationalId,
      dateOfBirth: adminUser.dateOfBirth,
      district: adminUser.district,
      occupation: adminUser.occupation,
      memberSince: adminUser.memberSince,
      verified: adminUser.verified,
      avatarUrl: adminUser.avatarUrl,
    };
    login("mock-token-admin", userProfile, null, null, 0, "admin");
    adminLoginLimiter.reset();
    setTimeout(() => { setLoading(false); onNavigate("admin-otp"); }, 800);
  };

  return (
    <div style={{ position: "relative", minHeight: "100%", background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button onClick={() => onNavigate("welcome")} aria-label="Go back" title="Go back" style={{ position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <ArrowLeft size={18} color="white" />
      </button>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>
            <ImageWithFallback src={kuulaLogo} alt="Kuula" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "white", margin: 0 }}>Kuula Admin</h1>
            <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>Staff access · Authorized personnel only</p>
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
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@kuula.ug"
                style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} placeholder="Enter your password"
                  style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 44px 0 14px", fontSize: 14, color: "#1F2937", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }} />
                <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer" }}>
                  {show ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
                </button>
              </div>
            </div>
            <button onClick={resetPw} style={{ fontSize: 12, color: "#FF6B35", border: "none", background: "none", cursor: "pointer", textAlign: "right", fontWeight: 600 }}>Forgot Password?</button>
          </div>

          {notice && (
            <p style={{ fontSize: 12, color: "#10B981", margin: "-6px 0 0", textAlign: "center" }}>{notice}</p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#EF4444", margin: "-6px 0 0", textAlign: "center" }}>{error}</p>
          )}

          <button onClick={submit} disabled={loading || lockoutRemaining > 0} style={{ width: "100%", height: 48, borderRadius: 12, background: (loading || lockoutRemaining > 0) ? "#9CA3AF" : "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: (loading || lockoutRemaining > 0) ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(255,107,53,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <><div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Signing in...</> : lockoutRemaining > 0 ? `Locked — ${formatLockout(lockoutRemaining)}` : "Sign In to Admin"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#FFF0E8", border: "1px solid #FFDCC8" }}>
            <Shield size={14} color="#FF6B35" />
            <span style={{ fontSize: 11, color: "#374151" }}>Two-factor authentication required for all staff accounts</span>
          </div>
        </div>

        <p style={{ fontSize: 11, color: "#475569", textAlign: "center" }}>
          © 2026 Kuula Microfinance Ltd. · UMRA Licensed
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
