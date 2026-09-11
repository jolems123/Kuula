import { ArrowLeft, MessageSquare } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { otpLimiter } from "../../lib/rate-limiter";

interface Props { onNavigate: (s: string) => void; }

export function PhoneVerifyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { pendingPhone, login } = useAppContext();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

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

  const handle = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    setError("");
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, key: string) => {
    if (key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const filled = otp.every((d) => d !== "");

  const verify = async () => {
    if (!filled || verifying) return;
    if (!pendingPhone) { setError("Start sign-up again to receive a code."); return; }

    // Client-side rate limiting: 8 OTP attempts per 5 minutes
    const rateCheck = otpLimiter.check();
    if (!rateCheck.allowed) {
      setLockoutRemaining(rateCheck.retryAfterMs);
      setError(`Too many attempts. Try again in ${formatLockout(rateCheck.retryAfterMs)}.`);
      return;
    }
    setError("");
    setVerifying(true);
    try {
      const s = await api.verifyPhone(pendingPhone, otp.join(""));
      otpLimiter.reset();
      login(s.token, s.user, s.credit, s.loan, s.savingsBalance, s.role, s.messages, s.unreadNotifications);
      onNavigate("kyc");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (lockoutRemaining > 0) return;
    setError("");
    try {
      await api.resendOtp(pendingPhone);
      setResent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't resend the code.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("create-account")} style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="#374151" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#1F2937", marginLeft: 12 }}>{t("phoneVerify.title")}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px", gap: 24 }}>
        {/* Icon */}
        <div style={{ width: 80, height: 80, borderRadius: 40, background: "var(--brand-light)", border: "2px solid var(--brand-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageSquare size={36} color="var(--brand-primary)" strokeWidth={1.5} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>{t("phoneVerify.enterOtp")}</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
            {t("phoneVerify.sentTo")}<br />
            <strong style={{ color: "#1F2937" }}>{pendingPhone || "your phone"}</strong>
          </p>
        </div>

        {/* OTP boxes */}
        <div style={{ display: "flex", gap: 10 }}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handle(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e.key)}
              style={{
                width: 46, height: 56, borderRadius: 12, textAlign: "center", fontSize: 24, fontWeight: 800,
                color: "#1F2937", background: digit ? "var(--brand-light)" : "#F9FAFB",
                border: `2px solid ${digit ? "var(--brand-primary)" : "#E5E7EB"}`, outline: "none",
              }}
            />
          ))}
        </div>

        <p style={{ fontSize: 13, color: "#6B7280" }}>
          {t("phoneVerify.didntReceive")}{" "}
          {resent
            ? <span style={{ color: "#12B984", fontWeight: 600 }}>{t("phoneVerify.codeResent")}</span>
            : <button onClick={resend} style={{ color: "var(--brand-primary)", fontWeight: 700, border: "none", background: "none", cursor: "pointer", fontSize: 13 }}>{t("phoneVerify.resendCode")}</button>
          }
        </p>

        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", width: "100%", boxSizing: "border-box" }}>
          <p style={{ fontSize: 12, color: "#92400E", textAlign: "center", margin: 0 }}>⏱ {t("phoneVerify.expiresIn")} <strong>{t("phoneVerify.tenMinutes")}</strong></p>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 20px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {error && <p style={{ fontSize: 12, color: "#EF4444", textAlign: "center", marginBottom: 8 }}>{error}</p>}
        <button
          onClick={verify}
          disabled={!filled || verifying || lockoutRemaining > 0}
          style={{
            width: "100%", height: 52, borderRadius: 14, cursor: filled && !verifying && lockoutRemaining <= 0 ? "pointer" : "not-allowed",
            background: filled && lockoutRemaining <= 0 ? "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" : "#E5E7EB",
            color: filled && lockoutRemaining <= 0 ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none",
            boxShadow: filled && lockoutRemaining <= 0 ? "0 4px 16px rgba(11,107,58,0.3)" : "none",
          }}
        >
          {lockoutRemaining > 0 ? `Locked — ${formatLockout(lockoutRemaining)}` : verifying ? "Verifying…" : t("phoneVerify.verifyAndContinue")}
        </button>
      </div>
    </div>
  );
}
