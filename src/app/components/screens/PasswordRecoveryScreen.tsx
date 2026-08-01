import { ArrowLeft, KeyRound, Phone, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { authRecoveryApi } from "../../api/auth-recovery";
import { ApiError } from "../../api/types";

interface Props { onNavigate: (screen: string) => void; }

type Step = "request" | "confirm" | "done";

export function PasswordRecoveryScreen({ onNavigate }: Props) {
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const requestCode = async () => {
    setError("");
    const value = identifier.trim();
    if (!value) {
      setError("Enter the phone number or email address used for your Kuula account.");
      return;
    }
    setBusy(true);
    try {
      const result = await authRecoveryApi.requestPasswordReset(value);
      setMessage(result.message);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request a reset code.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit SMS code.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("Use 8–72 characters with at least one letter and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await authRecoveryApi.confirmPasswordReset(
        identifier.trim(),
        code,
        newPassword
      );
      setMessage(result.message);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FFFC" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", borderBottom: "1px solid #DCFCE7", background: "white" }}>
        <button
          onClick={() => onNavigate("welcome")}
          aria-label="Back to login"
          style={{ width: 38, height: 38, borderRadius: 11, border: "none", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ArrowLeft size={19} color="#166534" />
        </button>
        <span style={{ marginLeft: 12, fontSize: 18, fontWeight: 800, color: "#14532D" }}>Recover your account</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 82, height: 82, borderRadius: 41, background: step === "done" ? "#DCFCE7" : "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          {step === "done" ? <ShieldCheck size={42} color="#15803D" /> : <KeyRound size={40} color="#D9531F" />}
        </div>

        {step === "request" && (
          <div style={{ width: "100%", maxWidth: 420 }}>
            <h1 style={{ textAlign: "center", fontSize: 23, fontWeight: 850, color: "#1F2937", margin: 0 }}>Forgot your PIN or password?</h1>
            <p style={{ textAlign: "center", fontSize: 13, lineHeight: 1.7, color: "#6B7280", margin: "10px 0 24px" }}>
              Enter your Uganda phone number or account email. Kuula will send a one-time code to the verified phone on the account.
            </p>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Phone number or email</label>
            <div style={{ position: "relative", marginTop: 7 }}>
              <Phone size={17} color="#9CA3AF" style={{ position: "absolute", left: 14, top: 16 }} />
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="+256 7XX XXX XXX or you@example.com"
                autoComplete="username"
                style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "white", padding: "0 14px 0 43px", fontSize: 14, outline: "none" }}
              />
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div style={{ width: "100%", maxWidth: 420 }}>
            <h1 style={{ textAlign: "center", fontSize: 23, fontWeight: 850, color: "#1F2937", margin: 0 }}>Enter the SMS code</h1>
            <p style={{ textAlign: "center", fontSize: 13, lineHeight: 1.7, color: "#6B7280", margin: "10px 0 22px" }}>{message}</p>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>6-digit code</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              style={{ width: "100%", height: 54, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "white", padding: "0 16px", fontSize: 24, fontWeight: 800, letterSpacing: 9, textAlign: "center", outline: "none", marginTop: 7 }}
            />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 18 }}>New password</label>
            <div style={{ position: "relative", marginTop: 7 }}>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "white", padding: "0 46px 0 14px", fontSize: 14, outline: "none" }}
              />
              <button onClick={() => setShowPassword((value) => !value)} aria-label="Show password" style={{ position: "absolute", right: 12, top: 13, background: "none", border: "none", cursor: "pointer" }}>
                {showPassword ? <EyeOff size={19} color="#6B7280" /> : <Eye size={19} color="#6B7280" />}
              </button>
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 14 }}>Confirm new password</label>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 13, border: "1.5px solid #D1FAE5", background: "white", padding: "0 14px", fontSize: 14, outline: "none", marginTop: 7 }}
            />

            <button
              onClick={requestCode}
              disabled={busy}
              style={{ display: "block", margin: "16px auto 0", border: "none", background: "none", color: "#166534", fontSize: 12, fontWeight: 750, cursor: "pointer" }}
            >
              Send another code
            </button>
          </div>
        )}

        {step === "done" && (
          <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 23, fontWeight: 850, color: "#1F2937", margin: 0 }}>Password updated</h1>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#6B7280", margin: "10px 0 0" }}>{message}</p>
          </div>
        )}

        {error && (
          <div role="alert" style={{ width: "100%", maxWidth: 420, marginTop: 18, padding: "11px 13px", borderRadius: 11, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 20px 36px", background: "white", borderTop: "1px solid #E5E7EB" }}>
        {step === "request" && (
          <button onClick={requestCode} disabled={busy} style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: busy ? "#86EFAC" : "linear-gradient(135deg, #16A34A, #15803D)", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {busy ? "Sending…" : "Send reset code"}
          </button>
        )}
        {step === "confirm" && (
          <button onClick={confirmReset} disabled={busy} style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: busy ? "#86EFAC" : "linear-gradient(135deg, #F4612B, #D9531F)", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {busy ? "Updating…" : "Set new password"}
          </button>
        )}
        {step === "done" && (
          <button onClick={() => onNavigate("welcome")} style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #16A34A, #15803D)", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            Return to sign in
          </button>
        )}
      </div>
    </div>
  );
}
