import { useState } from "react";
import { Phone, Lock, Eye, EyeOff, ShieldCheck, UserRound, Settings } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { PasswordRecoveryScreen } from "./PasswordRecoveryScreen";

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

  if (recovering) {
    return (
      <PasswordRecoveryScreen
        onNavigate={(screen) => {
          if (screen === "welcome") setRecovering(false);
          else onNavigate(screen);
        }}
      />
    );
  }

  const signIn = async () => {
    setError("");
    if (mode === "admin") {
      onNavigate("admin-login");
      return;
    }

    if (!phone.trim() || !pin) {
      setError("Enter your Uganda phone number and PIN.");
      return;
    }

    setBusy(true);
    try {
      if (env.USE_API) {
        const session = await api.login(normalizePhone(phone), pin);
        login(
          session.token,
          session.user,
          session.credit,
          session.loan,
          session.savingsBalance,
          session.role,
          session.messages,
          session.unreadNotifications
        );
        onNavigate(session.role === "admin" ? "admin-dashboard" : "home");
      } else {
        if (pin !== "1234") throw new ApiError("Demo PIN is 1234", 401);
        const now = new Date().toISOString();
        login(
          "demo-token",
          {
            id: "demo-user",
            role: "user",
            initials: "AN",
            fullName: "Amara Nakato",
            phone: normalizePhone(phone),
            email: null,
            nationalId: "",
            dateOfBirth: "",
            district: "Kampala",
            occupation: "Trader",
            memberSince: now,
            verified: true,
            avatarUrl: null,
          },
          {
            score: 650,
            maxScore: 850,
            tier: "Fair",
            percentile: 50,
            improvementSinceStart: 0,
          },
          {
            availableCredit: 200000,
            creditIncreaseFromLastMonth: 0,
            totalLoansCount: 0,
            activeLoan: null,
            nextPayment: null,
          },
          0,
          "user",
          [],
          0
        );
        onNavigate("home");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #14251D 0%, #0B1712 48%, #F8FFFC 48%)" }}>
      <div style={{ padding: "36px 24px 30px", textAlign: "center", color: "white" }}>
        <img src="/kuula-logo-dark.png" alt="Kuula" style={{ width: 205, maxWidth: "70%", height: "auto" }} />
        <p style={{ margin: "12px auto 0", maxWidth: 340, fontSize: 13, lineHeight: 1.6, color: "#D1FAE5" }}>
          Secure access to your Kuula account, loan offers, repayments, and credit history.
        </p>
      </div>

      <div style={{ flex: 1, padding: "0 18px 38px" }}>
        <div style={{ maxWidth: 440, margin: "0 auto", background: "white", borderRadius: 22, padding: 20, boxShadow: "0 16px 40px rgba(0,0,0,0.16)", border: "1px solid #ECFDF5" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 5, borderRadius: 13, background: "#F3F4F6" }}>
            <button onClick={() => setMode("customer")} style={{ height: 42, border: "none", borderRadius: 10, background: mode === "customer" ? "white" : "transparent", color: mode === "customer" ? "#166534" : "#6B7280", fontWeight: 800, cursor: "pointer", boxShadow: mode === "customer" ? "0 2px 7px rgba(0,0,0,0.08)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <UserRound size={17} /> Customer
            </button>
            <button onClick={() => setMode("admin")} style={{ height: 42, border: "none", borderRadius: 10, background: mode === "admin" ? "white" : "transparent", color: mode === "admin" ? "#166534" : "#6B7280", fontWeight: 800, cursor: "pointer", boxShadow: mode === "admin" ? "0 2px 7px rgba(0,0,0,0.08)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Settings size={17} /> Admin
            </button>
          </div>

          {mode === "customer" ? (
            <>
              <label style={{ display: "block", marginTop: 20, fontSize: 12, fontWeight: 750, color: "#374151" }}>Uganda phone number</label>
              <div style={{ position: "relative", marginTop: 7 }}>
                <Phone size={18} color="#9CA3AF" style={{ position: "absolute", left: 14, top: 16 }} />
                <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="7XX XXX XXX" style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "#F8FFFC", padding: "0 14px 0 44px", fontSize: 14, outline: "none" }} />
              </div>

              <label style={{ display: "block", marginTop: 15, fontSize: 12, fontWeight: 750, color: "#374151" }}>PIN or password</label>
              <div style={{ position: "relative", marginTop: 7 }}>
                <Lock size={18} color="#9CA3AF" style={{ position: "absolute", left: 14, top: 16 }} />
                <input value={pin} onChange={(event) => setPin(event.target.value)} type={showPin ? "text" : "password"} autoComplete="current-password" placeholder="Enter your PIN or password" onKeyDown={(event) => { if (event.key === "Enter") signIn(); }} style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "#F8FFFC", padding: "0 46px 0 44px", fontSize: 14, outline: "none" }} />
                <button onClick={() => setShowPin((value) => !value)} aria-label="Show PIN" style={{ position: "absolute", right: 11, top: 12, width: 30, height: 30, border: "none", background: "none", cursor: "pointer" }}>
                  {showPin ? <EyeOff size={19} color="#6B7280" /> : <Eye size={19} color="#6B7280" />}
                </button>
              </div>

              <button onClick={() => setRecovering(true)} style={{ display: "block", margin: "12px 0 0 auto", border: "none", background: "none", color: "#166534", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                Forgot PIN or password?
              </button>
            </>
          ) : (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: "#F0FDF4", border: "1px solid #BBF7D0", display: "flex", gap: 11 }}>
              <ShieldCheck size={22} color="#15803D" />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#14532D" }}>Operator access</p>
                <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.55, color: "#166534" }}>Continue to the protected admin sign-in screen.</p>
              </div>
            </div>
          )}

          {error && <div role="alert" style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 12 }}>{error}</div>}

          <button onClick={signIn} disabled={busy} style={{ width: "100%", height: 52, marginTop: 18, border: "none", borderRadius: 14, background: busy ? "#86EFAC" : "linear-gradient(135deg, #16A34A, #15803D)", color: "white", fontSize: 15, fontWeight: 850, cursor: "pointer" }}>
            {busy ? "Signing in…" : mode === "admin" ? "Continue to Admin Login" : "Sign In"}
          </button>

          {mode === "customer" && (
            <button onClick={() => onNavigate("create-account")} style={{ width: "100%", height: 48, marginTop: 10, border: "1.5px solid #BBF7D0", borderRadius: 14, background: "white", color: "#166534", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              Create a Kuula account
            </button>
          )}

          <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: 10.5, lineHeight: 1.6, color: "#9CA3AF" }}>
            By continuing, you agree to Kuula’s{" "}
            <button onClick={() => onNavigate("customer-terms")} style={{ border: "none", background: "none", padding: 0, color: "#166534", fontSize: "inherit", cursor: "pointer", textDecoration: "underline" }}>Terms</button>
            {" and "}
            <button onClick={() => onNavigate("customer-privacy-policy")} style={{ border: "none", background: "none", padding: 0, color: "#166534", fontSize: "inherit", cursor: "pointer", textDecoration: "underline" }}>Privacy Policy</button>.
          </p>
        </div>
      </div>
    </div>
  );
}
