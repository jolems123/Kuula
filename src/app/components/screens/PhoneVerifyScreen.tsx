import { MessageSquareText, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback, type ClipboardEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { otpLimiter } from "../../lib/rate-limiter";
import { AuthLayout } from "../auth/AuthLayout";

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

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtp(Array.from({ length: 6 }, (_, i) => digits[i] ?? ""));
    refs.current[Math.min(digits.length, 5)]?.focus();
  };

  const onKey = (i: number, key: string) => {
    if (key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const filled = otp.every((d) => d !== "");
  const locked = lockoutRemaining > 0;

  const verify = async (event?: FormEvent) => {
    event?.preventDefault();
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
      login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications);
      onNavigate("kyc");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (locked) return;
    setError("");
    try {
      await api.resendOtp(pendingPhone);
      setResent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't resend the code.");
    }
  };

  return (
    <AuthLayout onBack={() => onNavigate("create-account")}>
      <div className="kx-auth-head">
        <div className="kx-auth-head__icon"><MessageSquareText size={22} /></div>
        <h2>{t("phoneVerify.enterCode")}</h2>
        <p>{t("phoneVerify.sentTo")} <strong>{pendingPhone || "your phone"}</strong>. {t("phoneVerify.expiresIn")} {t("phoneVerify.tenMinutes")}.</p>
      </div>

      <form onSubmit={verify} noValidate>
        <div className="kx-otp" role="group" aria-label="Verification code">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              className={`kx-otp__cell${digit ? " is-filled" : ""}`}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              maxLength={1}
              value={digit}
              autoFocus={i === 0}
              onChange={(e) => handle(i, e.target.value)}
              onPaste={paste}
              onKeyDown={(e) => onKey(i, e.key)}
            />
          ))}
        </div>

        <div className="kx-auth-stack" style={{ marginTop: 22 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
          {resent && !error && <div className="kx-alert kx-alert--success" role="status"><CheckCircle2 size={16} />{t("phoneVerify.codeResent")}</div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={!filled || verifying || locked}>
            {locked ? `Locked · ${formatLockout(lockoutRemaining)}` : verifying ? <><span className="kx-spinner" />Verifying…</> : t("phoneVerify.verifyAndContinue")}
          </button>
        </div>
      </form>

      <div className="kx-auth-foot">
        <span>{t("phoneVerify.didntReceive")}</span>
        <button type="button" className="kx-link" onClick={resend} disabled={locked}>{t("phoneVerify.resendCode")}</button>
      </div>
    </AuthLayout>
  );
}
