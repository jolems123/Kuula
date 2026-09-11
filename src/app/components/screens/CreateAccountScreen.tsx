import { ArrowLeft, User, Phone, Mail, CreditCard, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { useAppContext } from "../../context/AppContext";
import { customerLoginLimiter } from "../../lib/rate-limiter";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";

interface Props { onNavigate: (s: string) => void; }

// Version of the Terms & Privacy Policy the user is consenting to. Bump this
// when the published terms change so re-consent can be detected.
const TERMS_VERSION = "2026-07-23";

export function CreateAccountScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { setPendingPhone } = useAppContext();
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", phone: "", email: "", nin: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const [hover, setHover] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const emailValid = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const passwordStrength = (p: string) => {
    if (!p) return { level: 0, label: "", color: "" };
    if (p.length < 8) return { level: 1, label: t("createAccount.weak"), color: "#EF4444" };
    if (p.length < 10 || !/[A-Z]/.test(p) || !/\d/.test(p))
      return { level: 2, label: t("createAccount.fair"), color: "#F59E0B" };
    return { level: 3, label: t("createAccount.strong"), color: "#12B984" };
  };

  const strength = passwordStrength(form.password);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t("createAccount.errorNameRequired");
    if (!form.phone.trim()) e.phone = t("createAccount.errorPhoneRequired");
    else if (!/^\d{9}$/.test(form.phone.replace(/\s/g, "")))
      e.phone = t("createAccount.errorPhoneInvalid");
    if (form.email.trim() && !emailValid(form.email.trim()))
      e.email = t("createAccount.errorEmailInvalid");
    if (!form.nin.trim()) e.nin = t("createAccount.errorNinRequired");
    else if (!isValidUgandaNin(form.nin)) e.nin = t("createAccount.errorNinInvalid");
    if (!form.password.trim()) e.password = t("createAccount.errorPasswordRequired");
    else if (form.password.length < 8) e.password = t("createAccount.errorPasswordMinLength");
    if (!agreed) e.terms = t("createAccount.mustAgree");
    setErrors(e);
    if (Object.keys(e).length) return;

    // Client-side rate limiting: 10 attempts per 5 minutes
    const rateCheck = customerLoginLimiter.check();
    if (!rateCheck.allowed) {
      setLockoutRemaining(rateCheck.retryAfterMs);
      setErrors({ form: `Too many attempts. Try again in ${formatLockout(rateCheck.retryAfterMs)}.` });
      return;
    }

    // Create a real account against the Node backend.
    if (env.USE_API) {
      setSubmitting(true);
      try {
        const phone = "+256" + form.phone.replace(/\s/g, "");
        await api.signUp({ name: form.name.trim(), phone, email: form.email.trim(), password: form.password, nationalId: normalizeNin(form.nin), acceptedTerms: true, termsVersion: TERMS_VERSION });
        // Verify the phone next; that step establishes the auth session (token)
        // that KYC and the rest of the app require.
        setPendingPhone(phone);
        onNavigate("phone-verify");
      } catch (err) {
        setErrors({ form: err instanceof ApiError ? err.message : "Could not create your account. Try again." });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    customerLoginLimiter.reset();
    onNavigate("kyc");
  };

  const inputStyle = (err?: string): React.CSSProperties => ({
    width: "100%", height: 50, borderRadius: 12, border: `1.5px solid ${err ? "#EF4444" : "#D1FAE5"}`,
    paddingLeft: 42, paddingRight: 16, fontSize: 14, color: "#0F172A",
    background: "#F8FFFC", outline: "none", boxSizing: "border-box",
  });

  const iconStyle: React.CSSProperties = {
    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
  };

  const linkStyle: React.CSSProperties = {
    border: "none", background: "none", padding: 0, margin: 0,
    color: "#166534", fontWeight: 800, fontSize: 12,
    textDecoration: "underline", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FFFC", paddingTop: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 12px", borderBottom: "1px solid #DCFCE7", background: "linear-gradient(180deg, #ECFDF5 0%, #F8FFFC 100%)" }}>
        <button onClick={() => onNavigate("welcome")} style={{ width: 36, height: 36, borderRadius: 10, background: "#DCFCE7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="#166534" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 800, color: "#14532D", marginLeft: 12 }}>{t("createAccount.title")}</span>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 13, color: "#166534", marginBottom: 4, fontWeight: 600 }}>{t("createAccount.subtitle")}</p>

        {/* Full Name */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.fullNameLabel")}</label>
          <div style={{ position: "relative" }}>
            <User size={16} color="#9CA3AF" style={iconStyle} />
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("createAccount.fullNamePlaceholder")} style={inputStyle(errors.name)} />
          </div>
          {errors.name && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.name}</p>}
        </div>

        {/* Phone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.phoneLabel")}</label>
          <div style={{ position: "relative", display: "flex", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", height: 50, padding: "0 12px", background: "#ECFDF5", borderRadius: 12, border: "1.5px solid #D1FAE5", fontSize: 14, fontWeight: 700, color: "#166534", whiteSpace: "nowrap" }}>🇺🇬 +256</div>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="7XX XXX XXX" style={{ ...inputStyle(errors.phone), paddingLeft: 16, flex: 1 }} />
          </div>
          {errors.phone && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.phone}</p>}
        </div>

        {/* Email */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.emailLabel")} <span style={{ color: "#9CA3AF", fontWeight: 400 }}>({t("createAccount.optional")})</span></label>
          <div style={{ position: "relative" }}>
            <Mail size={16} color="#9CA3AF" style={iconStyle} />
            <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("createAccount.emailPlaceholder")} type="email" style={inputStyle(errors.email)} />
          </div>
          {errors.email && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.email}</p>}
          {form.email && !errors.email && emailValid(form.email) && (
            <p style={{ fontSize: 11, color: "#12B984", marginTop: 4 }}>✓ {t("createAccount.validEmail")}</p>
          )}
        </div>

        {/* NIN */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.ninLabel")}</label>
          <div style={{ position: "relative" }}>
            <CreditCard size={16} color="#9CA3AF" style={iconStyle} />
            <input value={form.nin} onChange={(e) => set("nin", e.target.value.toUpperCase())} placeholder="e.g. CM8602410E8EWE" maxLength={14} style={inputStyle(errors.nin)} />
          </div>
          {errors.nin && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.nin}</p>}
        </div>

        {/* Password */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.passwordLabel")}</label>
          <div style={{ position: "relative" }}>
            <input value={form.password} onChange={(e) => set("password", e.target.value)} type={showPw ? "text" : "password"} placeholder={t("createAccount.passwordPlaceholder")} style={{ ...inputStyle(errors.password), paddingLeft: 16, paddingRight: 44 }} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer" }}>
              {showPw ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
            </button>
          </div>
          {errors.password && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.password}</p>}
          {form.password && !errors.password && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {[1, 2, 3].map((l) => (
                  <div key={l} style={{ flex: 1, height: 4, borderRadius: 2, background: strength.level >= l ? strength.color : "#E5E7EB", transition: "background 0.3s" }} />
                ))}
              </div>
              <p style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>{strength.label} {t("createAccount.passwordWord")}</p>
            </div>
          )}
        </div>

        {/* Terms & Privacy consent — required before an account can be created */}
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#ECFDF5", border: `1px solid ${errors.terms ? "#FCA5A5" : "#BBF7D0"}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              type="checkbox"
              checked={agreed}
              aria-label={t("createAccount.agreePrefix")}
              onChange={(ev) => {
                setAgreed(ev.target.checked);
                if (ev.target.checked) setErrors(({ terms, ...rest }) => rest);
              }}
              style={{ width: 18, height: 18, marginTop: 1, accentColor: "#16A34A", flexShrink: 0, cursor: "pointer" }}
            />
            <span style={{ fontSize: 12, color: "#14532D", lineHeight: 1.6 }}>
              {t("createAccount.agreePrefix")}{" "}
              <button type="button" onClick={() => onNavigate("customer-terms")} style={linkStyle}>{t("createAccount.termsLink")}</button>
              {" "}{t("createAccount.and")}{" "}
              <button type="button" onClick={() => onNavigate("customer-privacy-policy")} style={linkStyle}>{t("createAccount.privacyLink")}</button>
            </span>
          </div>
          {errors.terms && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 6, marginLeft: 28 }}>{errors.terms}</p>}
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 20px 36px", background: "white", borderTop: "1px solid #DCFCE7" }}>
        {errors.form && <p style={{ fontSize: 12, color: "#EF4444", textAlign: "center", marginBottom: 8 }}>{errors.form}</p>}
        <button
          onClick={submit}
          disabled={submitting || lockoutRemaining > 0}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            background: lockoutRemaining > 0 ? "#9CA3AF" : submitting ? "#86EFAC" : hover ? "linear-gradient(135deg, #15803D, #14532D)" : "linear-gradient(135deg, #16A34A, #15803D)",
            color: lockoutRemaining > 0 ? "#6B7280" : "white", fontSize: 16, fontWeight: 800, border: "none",
            boxShadow: lockoutRemaining > 0 ? "none" : hover ? "0 8px 24px rgba(21,128,61,0.35)" : "0 4px 16px rgba(21,128,61,0.3)",
            cursor: lockoutRemaining > 0 ? "not-allowed" : submitting ? "wait" : "pointer", transform: lockoutRemaining > 0 || submitting ? "none" : hover ? "translateY(-1px)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          {lockoutRemaining > 0 ? `Locked — ${formatLockout(lockoutRemaining)}` : submitting ? t("createAccount.creating") : t("createAccount.createAccount")}
        </button>
        <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 10 }}>
          {t("createAccount.alreadyHaveAccount")}{" "}
          <button onClick={() => onNavigate("welcome")} style={{ color: "#166534", fontWeight: 800, border: "none", background: "none", cursor: "pointer", fontSize: 12 }}>{t("createAccount.logIn")}</button>
        </p>
      </div>
    </div>
  );
}
