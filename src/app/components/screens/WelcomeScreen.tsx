import { useState } from "react";
import { Phone, Lock, Eye, EyeOff, ShieldCheck, UserRound, Settings, ChevronDown } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { PasswordRecoveryScreen } from "./PasswordRecoveryScreen";
import { storeSessionTokens } from "../../lib/session-vault";

interface Props { onNavigate: (screen: string) => void; }
type LoginMode = "customer" | "admin";

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  return `+256${digits}`;
}

export function WelcomeScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  const [mode, setMode] = useState<LoginMode>("customer");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);

  if (recovering) return <PasswordRecoveryScreen onNavigate={(screen) => screen === "welcome" ? setRecovering(false) : onNavigate(screen)} />;

  const signIn = async () => {
    setError("");
    if (mode === "admin") { onNavigate("admin-login"); return; }
    if (!phone.trim() || !pin) { setError("Enter your Uganda phone number and PIN."); return; }
    setBusy(true);
    try {
      if (env.USE_API) {
        const session = await api.login(normalizePhone(phone), pin);
        const expiresAt = Date.now() + (session.accessExpiresInSeconds ?? 900) * 1000;
        storeSessionTokens({ accessToken: session.token, refreshToken: session.refreshToken, accessExpiresAt: expiresAt });
        login(session.token, session.user, session.credit, session.loan, session.savingsBalance, session.role, session.messages, session.unreadNotifications, expiresAt);
        const isStaff = session.role === "admin" || session.role === "manager" || session.role === "officer";
        onNavigate(isStaff ? "admin-dashboard" : "home");
      } else {
        if (pin !== "1234") throw new ApiError("Demo PIN is 1234", 401);
        const now = new Date().toISOString();
        login("demo-token", { id: "demo-user", role: "user", initials: "AN", fullName: "Amara Nakato", phone: normalizePhone(phone), email: null, nationalId: "", dateOfBirth: "", district: "Kampala", occupation: "Trader", memberSince: now, verified: true, avatarUrl: null }, { score: 650, maxScore: 850, tier: "Fair", percentile: 50, improvementSinceStart: 0 }, { availableCredit: 200000, creditIncreaseFromLastMonth: 0, totalLoansCount: 0, activeLoan: null, nextPayment: null }, 0, "user", [], 0);
        onNavigate("home");
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not sign in. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: "34px 22px 26px", display: "flex", flexDirection: "column" }}>
      <div style={{ width: "100%", paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "center" }}><img src="/kuula-logo.svg" alt="Kuula Microfinance Limited" style={{ display: "block", width: 190, maxWidth: "72%", height: "auto", margin: "0 auto" }} /></div>
      <div style={{ marginTop: 38, textAlign: "center" }}><h1 style={{ margin: 0, fontSize: 29, fontWeight: 800, color: "#101815", letterSpacing: -0.8 }}>Welcome back</h1><p style={{ margin: "7px 0 0", fontSize: 14, color: "#68766F" }}>Sign in to continue</p></div>
      <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, padding: 5, borderRadius: 13, background: "#F2F6F4" }}>
        <button onClick={() => setMode("customer")} style={{ height: 40, border: 0, borderRadius: 10, background: mode === "customer" ? "white" : "transparent", color: mode === "customer" ? "#0B5E3A" : "#7B8781", boxShadow: mode === "customer" ? "0 3px 10px rgba(4,53,31,.08)" : "none", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}><UserRound size={16} /> Customer</button>
        <button onClick={() => setMode("admin")} style={{ height: 40, border: 0, borderRadius: 10, background: mode === "admin" ? "white" : "transparent", color: mode === "admin" ? "#0B5E3A" : "#7B8781", boxShadow: mode === "admin" ? "0 3px 10px rgba(4,53,31,.08)" : "none", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}><Settings size={16} /> Admin</button>
      </div>
      {mode === "customer" ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ position: "relative" }}><Phone size={19} color="#52615A" style={{ position: "absolute", left: 16, top: 16 }} /><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+256 7XX XXX XXX" style={{ width: "100%", height: 54, padding: "0 16px 0 48px", border: "1px solid #DCE7E1", borderRadius: 13, fontSize: 14 }} /></div>
          <div style={{ position: "relative", marginTop: 14 }}><Lock size={19} color="#52615A" style={{ position: "absolute", left: 16, top: 16 }} /><input value={pin} onChange={(event) => setPin(event.target.value)} type={showPin ? "text" : "password"} autoComplete="current-password" placeholder="Password or PIN" onKeyDown={(event) => { if (event.key === "Enter") void signIn(); }} style={{ width: "100%", height: 54, padding: "0 48px", border: "1px solid #DCE7E1", borderRadius: 13, fontSize: 14 }} /><button onClick={() => setShowPin((value) => !value)} aria-label="Show password" style={{ position: "absolute", right: 12, top: 11, width: 32, height: 32, border: 0, background: "transparent" }}>{showPin ? <EyeOff size={19} color="#52615A" /> : <Eye size={19} color="#52615A" />}</button></div>
          <button onClick={() => setRecovering(true)} style={{ display: "block", margin: "12px 0 0 auto", border: 0, background: "transparent", color: "#0B5E3A", fontSize: 12, fontWeight: 700 }}>Forgot password?</button>
        </div>
      ) : <div style={{ marginTop: 22, padding: 16, borderRadius: 14, background: "#F3FAF7", border: "1px solid #DCE7E1", display: "flex", gap: 12 }}><ShieldCheck size={22} color="#0B5E3A" /><div><p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#064A2E" }}>Secure operator access</p><p style={{ margin: "5px 0 0", fontSize: 12, color: "#68766F" }}>Continue to the protected staff sign-in.</p></div></div>}
      {error && <div role="alert" style={{ marginTop: 14, padding: "11px 13px", borderRadius: 11, background: "#FFF1F1", border: "1px solid #F7CCCC", color: "#B73535", fontSize: 12 }}>{error}</div>}
      <button onClick={() => void signIn()} disabled={busy} className="kuula-primary" style={{ width: "100%", height: 54, marginTop: 22, fontSize: 15 }}>{busy ? "Signing in…" : mode === "admin" ? "Continue to Admin Login" : "Sign In"}</button>
      {mode === "customer" && <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#68766F" }}>Don’t have an account? <button onClick={() => onNavigate("create-account")} style={{ border: 0, background: "transparent", padding: 0, color: "#0B5E3A", fontWeight: 800 }}>Sign up</button></p>}
      <div style={{ marginTop: "auto", paddingTop: 34, display: "flex", justifyContent: "center" }}><button onClick={() => onNavigate("language")} style={{ minWidth: 142, height: 45, border: "1px solid #DCE7E1", background: "white", borderRadius: 12, color: "#26372E", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13 }}>English <ChevronDown size={15} /></button></div>
    </div>
  );
}
