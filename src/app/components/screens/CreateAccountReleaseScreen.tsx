import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";

interface Props { onNavigate: (screen: string) => void; }

export const CURRENT_PUBLIC_TERMS_VERSION = "2026-08-20";

export function CreateAccountReleaseScreen({ onNavigate }: Props) {
  const { setPendingPhone } = useAppContext();
  const [form, setForm] = useState({ name: "", phone: "", email: "", nin: "", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (busy) return;
    setError("");
    const name = form.name.trim();
    const localPhone = form.phone.replace(/\s+/g, "");
    const email = form.email.trim();
    const nin = normalizeNin(form.nin);

    if (name.length < 2) { setError("Enter your full name."); return; }
    if (!/^7\d{8}$/.test(localPhone)) { setError("Enter a valid Uganda mobile number after +256, for example 7XXXXXXXX."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address or leave email blank."); return; }
    if (!isValidUgandaNin(nin)) { setError("Enter a valid 14-character Uganda NIN."); return; }
    if (form.password.length < 8) { setError("Use a password of at least 8 characters."); return; }
    if (!accepted) { setError("Accept the current Terms of Service and Privacy Notice to continue."); return; }

    const phone = `+256${localPhone}`;
    setBusy(true);
    try {
      await api.signUp({
        name,
        phone,
        email: email || undefined,
        password: form.password,
        nationalId: nin,
        acceptedTerms: true,
        termsVersion: CURRENT_PUBLIC_TERMS_VERSION,
      });
      setPendingPhone(phone);
      onNavigate("phone-verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", height: 48, borderRadius: 12, border: "1px solid #D8E2DC", padding: "0 13px", background: "white", color: "#13251C", fontSize: 14, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F8FAF9" }}>
      <div style={{ display: "flex", alignItems: "center", padding: 16, background: "#0B5E3A" }}>
        <button aria-label="Back" onClick={() => onNavigate("welcome")} style={{ width: 36, height: 36, border: 0, borderRadius: 10, background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ color: "white", fontSize: 17, fontWeight: 800, marginLeft: 12 }}>Create Kuula Account</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 128px", display: "grid", gap: 14 }}>
        <div><label style={{ fontSize: 12, fontWeight: 700, color: "#425149" }}>Full name</label><input autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} style={{ ...inputStyle, marginTop: 6 }} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700, color: "#425149" }}>Uganda mobile number</label><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}><div style={{ height: 48, borderRadius: 12, border: "1px solid #D8E2DC", background: "#EEF7F2", display: "grid", placeItems: "center", padding: "0 12px", fontWeight: 800, color: "#0B5E3A" }}>+256</div><input inputMode="tel" autoComplete="tel" maxLength={9} placeholder="7XXXXXXXX" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 9))} style={{ ...inputStyle, flex: 1 }} /></div></div>
        <div><label style={{ fontSize: 12, fontWeight: 700, color: "#425149" }}>Email <span style={{ fontWeight: 400, color: "#87968E" }}>(optional)</span></label><input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} style={{ ...inputStyle, marginTop: 6 }} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700, color: "#425149" }}>National ID number (NIN)</label><input autoCapitalize="characters" maxLength={14} value={form.nin} onChange={(e) => set("nin", e.target.value.toUpperCase())} style={{ ...inputStyle, marginTop: 6, letterSpacing: .5 }} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700, color: "#425149" }}>Password</label><div style={{ position: "relative", marginTop: 6 }}><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} style={{ position: "absolute", right: 8, top: 7, width: 34, height: 34, border: 0, background: "transparent", display: "grid", placeItems: "center" }}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><p style={{ margin: "5px 0 0", fontSize: 10.5, color: "#87968E" }}>Use at least 8 characters. Do not reuse your Mobile Money PIN.</p></div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, background: "#EEF7F2", border: "1px solid #C9E2D4" }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: "#0B5E3A" }} />
          <span style={{ fontSize: 11.5, color: "#37644F", lineHeight: 1.55 }}>I have read and accept Kuula’s <button type="button" onClick={(event) => { event.preventDefault(); onNavigate("customer-terms"); }} style={{ border: 0, padding: 0, background: "none", color: "#0B5E3A", fontWeight: 800, textDecoration: "underline" }}>Terms of Service</button> and <button type="button" onClick={(event) => { event.preventDefault(); onNavigate("customer-privacy-policy"); }} style={{ border: 0, padding: 0, background: "none", color: "#0B5E3A", fontWeight: 800, textDecoration: "underline" }}>Privacy Notice</button> (version {CURRENT_PUBLIC_TERMS_VERSION}).</span>
        </label>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 18px 32px", background: "white", borderTop: "1px solid #E8EEEA" }}>
        {error && <p role="alert" style={{ margin: "0 0 8px", color: "#B42318", fontSize: 11.5, lineHeight: 1.4, textAlign: "center" }}>{error}</p>}
        <button disabled={busy} onClick={() => { void submit(); }} style={{ width: "100%", height: 50, border: 0, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 15, fontWeight: 800, opacity: busy ? .6 : 1 }}>{busy ? "Creating account…" : "Create Account"}</button>
      </div>
    </div>
  );
}
