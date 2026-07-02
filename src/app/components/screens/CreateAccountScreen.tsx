import { ArrowLeft, User, Phone, Mail, CreditCard, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";
import { useAppContext } from "../../context/AppContext";

interface Props { onNavigate: (s: string) => void; }

export function CreateAccountScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { setPendingPhone } = useAppContext();
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", phone: "", email: "", nin: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const [hover, setHover] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const emailValid = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const passwordStrength = (p: string) => {
    if (!p) return { level: 0, label: "", color: "" };
    if (p.length < 8) return { level: 1, label: t("createAccount.weak"), color: "#EF4444" };
    if (p.length < 10 || !/[A-Z]/.test(p) || !/\d/.test(p))
      return { level: 2, label: t("createAccount.fair"), color: "#F59E0B" };
    return { level: 3, label: t("createAccount.strong"), color: "#10B981" };
  };

  const strength = passwordStrength(form.password);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t("createAccount.errorNameRequired");
    if (!form.phone.trim()) e.phone = t("createAccount.errorPhoneRequired");
    else if (!/^\d{9}$/.test(form.phone.replace(/\s/g, "")))
      e.phone = t("createAccount.errorPhoneInvalid");
    if (!form.email.trim()) e.email = t("createAccount.errorEmailRequired");
    else if (!emailValid(form.email)) e.email = t("createAccount.errorEmailInvalid");
    if (!form.nin.trim()) e.nin = t("createAccount.errorNinRequired");
    else if (!/^\d{10,12}$/.test(form.nin.replace(/\s/g, ""))) e.nin = t("createAccount.errorNinInvalid");
    if (!form.password.trim()) e.password = t("createAccount.errorPasswordRequired");
    else if (form.password.length < 8) e.password = t("createAccount.errorPasswordMinLength");
    setErrors(e);
    if (Object.keys(e).length) return;

    // Create a real account against the active backend; demo builds skip to KYC.
    if (env.USE_API || env.BACKEND === "supabase") {
      setSubmitting(true);
      try {
        const phone = "+256" + form.phone.replace(/\s/g, "");
        await api.signUp({ name: form.name, phone, email: form.email, password: form.password, nationalId: form.nin.replace(/\s/g, "") });
        if (env.BACKEND === "supabase") {
          // Supabase has now texted an OTP via Twilio — confirm it before KYC.
          setPendingPhone(phone);
          onNavigate("phone-verify");
        } else {
          // Legacy node backend has no SMS OTP step.
          onNavigate("kyc");
        }
      } catch (err) {
        setErrors({ form: err instanceof ApiError ? err.message : "Could not create your account. Try again." });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    onNavigate("kyc");
  };

  const inputStyle = (err?: string): React.CSSProperties => ({
    width: "100%", height: 50, borderRadius: 12, border: `1.5px solid ${err ? "#EF4444" : "#E5E7EB"}`,
    paddingLeft: 42, paddingRight: 16, fontSize: 14, color: "#1F2937",
    background: "#F9FAFB", outline: "none", boxSizing: "border-box",
  });

  const iconStyle: React.CSSProperties = {
    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", paddingTop: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("welcome")} style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="#374151" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#1F2937", marginLeft: 12 }}>{t("createAccount.title")}</span>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>{t("createAccount.subtitle")}</p>

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
            <div style={{ display: "flex", alignItems: "center", height: 50, padding: "0 12px", background: "#F3F4F6", borderRadius: 12, border: "1.5px solid #E5E7EB", fontSize: 14, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>🇺🇬 +256</div>
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
            <p style={{ fontSize: 11, color: "#10B981", marginTop: 4 }}>✓ {t("createAccount.validEmail")}</p>
          )}
        </div>

        {/* NIN */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("createAccount.ninLabel")}</label>
          <div style={{ position: "relative" }}>
            <CreditCard size={16} color="#9CA3AF" style={iconStyle} />
            <input value={form.nin} onChange={(e) => set("nin", e.target.value)} placeholder="e.g. CM86H00123PL" style={inputStyle(errors.nin)} />
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

        {/* Terms notice */}
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#ECF5F0", border: "1px solid #D2E9DD" }}>
          <p style={{ fontSize: 11, color: "#083A24", lineHeight: 1.6 }}>
            {t("createAccount.termsNotice")}
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 20px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {errors.form && <p style={{ fontSize: 12, color: "#EF4444", textAlign: "center", marginBottom: 8 }}>{errors.form}</p>}
        <button
          onClick={submit}
          disabled={submitting}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            background: submitting ? "#8FCBAC" : hover ? "linear-gradient(135deg, #0A4A2E, #083A24)" : "linear-gradient(135deg, #0D5C3A, #0A4A2E)",
            color: "white", fontSize: 16, fontWeight: 700, border: "none",
            boxShadow: hover ? "0 6px 24px rgba(13,92,58,0.45)" : "0 4px 16px rgba(13,92,58,0.3)",
            cursor: submitting ? "wait" : "pointer", transform: hover ? "translateY(-1px)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          {submitting ? t("createAccount.creating") : t("createAccount.createAccount")}
        </button>
        <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 10 }}>
          {t("createAccount.alreadyHaveAccount")}{" "}
          <button onClick={() => onNavigate("welcome")} style={{ color: "#0D5C3A", fontWeight: 700, border: "none", background: "none", cursor: "pointer", fontSize: 12 }}>{t("createAccount.logIn")}</button>
        </p>
      </div>
    </div>
  );
}
