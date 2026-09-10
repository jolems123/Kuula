import { ArrowLeft, Shield, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { staffUiTier, useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { storeSessionTokens } from "../../lib/session-vault";

interface Props { onNavigate: (s: string) => void; }

/**
 * Staff invitation acceptance. The Super Admin invites a staff member by phone
 * number; here the invitee proves ownership of that number with the SMS code
 * and chooses their password. Afterwards they sign in with phone + password +
 * SMS code like every other staff member.
 */
export function AdminActivateScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const resend = async () => {
    setError(""); setNotice("");
    if (!phone.trim()) { setError("Enter the phone number the invitation was sent to."); return; }
    setResending(true);
    try {
      const r = await api.resendStaffInvite(phone.trim());
      setNotice(r.message || "If that number has a pending staff invitation, a new activation code has been sent.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the activation code.");
    } finally { setResending(false); }
  };

  const submit = async () => {
    setError(""); setNotice("");
    if (!phone.trim()) { setError("Enter the phone number the invitation was sent to."); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit activation code from the SMS."); return; }
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setError("Password must be at least 8 characters with a letter and a number."); return; }
    if (pw !== pw2) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const s = await api.activateStaffInvite(phone.trim(), code.trim(), pw);
      const expiresAt = Date.now() + (s.accessExpiresInSeconds ?? 900) * 1000;
      if (s.refreshToken) storeSessionTokens({ accessToken: s.token, refreshToken: s.refreshToken, accessExpiresAt: expiresAt });
      login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
      onNavigate(staffUiTier(s.role) === "officer" ? "admin-officer-dashboard" : "admin-dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activation failed. Request a new code and try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100%", background: "linear-gradient(160deg, #0B5E3A, #04351F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <button onClick={() => onNavigate("admin-login")} aria-label="Go back" style={{ position: "absolute", top: 18, left: 18, width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.20)", display: "grid", placeItems: "center" }}><ArrowLeft size={19} color="white" /></button>
      <div style={{ width: "100%", maxWidth: 430 }}>
        <div style={{ textAlign: "center" }}>
          <img src="/kuula-logo.svg" alt="Kuula" style={{ width: 190, filter: "brightness(0) invert(1)", opacity: .98 }} />
          <h1 style={{ margin: "18px 0 0", fontSize: 25, color: "white", fontWeight: 800 }}>Activate Staff Account</h1>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,.72)", fontSize: 13 }}>For invited Kuula personnel</p>
        </div>
        <div style={{ marginTop: 26, background: "white", borderRadius: 24, padding: 26, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
          <p style={{ margin: "0 0 20px", color: "#68766F", fontSize: 13 }}>Enter the phone number your invitation was sent to and the 6-digit code from the SMS.</p>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 7 }}>Staff phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+256 7XX XXX XXX" style={{ width: "100%", height: 50, padding: "0 14px" }} />

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", margin: "16px 0 7px" }}>Activation code</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" style={{ flex: 1, height: 50, padding: "0 14px" }} />
            <button onClick={resend} disabled={resending} style={{ height: 50, padding: "0 14px", borderRadius: 12, border: "1px solid #D5DED8", background: "#F4F8F5", color: "#0B5E3A", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{resending ? "Sending…" : "Send code"}</button>
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", margin: "16px 0 7px" }}>Choose password</label>
          <div style={{ position: "relative" }}>
            <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters, letters and numbers" style={{ width: "100%", height: 50, padding: "0 46px 0 14px" }} />
            <button onClick={() => setShow(!show)} aria-label="Show password" style={{ position: "absolute", right: 10, top: 9, width: 32, height: 32, border: 0, background: "transparent" }}>{show ? <EyeOff size={17} color="#68766F" /> : <Eye size={17} color="#68766F" />}</button>
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", margin: "16px 0 7px" }}>Confirm password</label>
          <input value={pw2} onChange={(e) => setPw2(e.target.value)} type={show ? "text" : "password"} autoComplete="new-password" placeholder="Repeat your password" style={{ width: "100%", height: 50, padding: "0 14px" }} />

          {notice && <p style={{ fontSize: 12, color: "#15864E", textAlign: "center" }}>{notice}</p>}
          {error && <p style={{ fontSize: 12, color: "#DC4C4C", textAlign: "center" }}>{error}</p>}

          <button onClick={submit} disabled={loading} className="kuula-primary" style={{ width: "100%", height: 52, marginTop: 18 }}>
            {loading ? "Activating…" : "Activate Account"}
          </button>
          <div style={{ marginTop: 16, padding: "11px 12px", borderRadius: 12, background: "#FFF7D8", display: "flex", alignItems: "center", gap: 9 }}><Shield size={15} color="#9B7410" /><span style={{ fontSize: 11, color: "#665218" }}>Only phone numbers invited by the Super Admin can be activated.</span></div>
        </div>
        <p style={{ margin: "20px 0 0", textAlign: "center", color: "rgba(255,255,255,.60)", fontSize: 10.5 }}>© 2026 Kuula Microfinance Limited</p>
      </div>
    </div>
  );
}
