import { Eye, EyeOff, UserRoundCheck, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { staffUiTier, useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { storeSessionTokens } from "../../lib/session-vault";
import { AuthLayout } from "../auth/AuthLayout";
import { toUgandaPhone } from "../../lib/phone";

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
    const staffPhone = toUgandaPhone(phone);
    if (!staffPhone) { setError("Enter the phone number the invitation was sent to."); return; }
    setResending(true);
    try {
      const r = await api.resendStaffInvite(staffPhone);
      setNotice(r.message || "If that number has a pending staff invitation, a new activation code has been sent.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the activation code.");
    } finally { setResending(false); }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(""); setNotice("");
    const staffPhone = toUgandaPhone(phone);
    if (!staffPhone) { setError("Enter the phone number the invitation was sent to."); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit activation code from the SMS."); return; }
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setError("Password must be at least 8 characters with a letter and a number."); return; }
    if (pw !== pw2) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const s = await api.activateStaffInvite(staffPhone, code.trim(), pw);
      const expiresAt = Date.now() + (s.accessExpiresInSeconds ?? 900) * 1000;
      if (s.refreshToken) storeSessionTokens({ accessToken: s.token, refreshToken: s.refreshToken, accessExpiresAt: expiresAt });
      login(s.token, s.user, s.credit, s.loan, s.role, s.messages, s.unreadNotifications, expiresAt);
      onNavigate(staffUiTier(s.role) === "officer" ? "admin-officer-dashboard" : "admin-dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activation failed. Request a new code and try again.");
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout logoSubtitle="Staff portal" onBack={() => onNavigate("admin-login")} backLabel="Back to sign in">
      <div className="kx-auth-head">
        <div className="kx-auth-head__icon"><UserRoundCheck size={22} /></div>
        <h2>Activate your account</h2>
        <p>Use the phone number your invitation was sent to, then choose a password.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="kx-field">
          <label className="kx-label" htmlFor="invite-phone">Phone number</label>
          <div className="kx-control">
            <span className="kx-control__prefix">+256</span>
            <input id="invite-phone" className="kx-input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="7XX XXX XXX" autoFocus />
          </div>
        </div>

        <div className="kx-field">
          <label className="kx-label" htmlFor="invite-code">Activation code</label>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="kx-control" style={{ flex: 1 }}>
              <input id="invite-code" className="kx-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
            </div>
            <button type="button" className="kx-btn kx-btn--secondary" style={{ height: 46 }} onClick={resend} disabled={resending}>
              {resending ? "Sending…" : "Send code"}
            </button>
          </div>
        </div>

        <div className="kx-field">
          <label className="kx-label" htmlFor="invite-password">Choose a password</label>
          <div className="kx-control">
            <input id="invite-password" className="kx-input" value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" />
            <button type="button" className="kx-control__action" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <span className="kx-hint">Use letters and at least one number.</span>
        </div>

        <div className="kx-field">
          <label className="kx-label" htmlFor="invite-password-2">Confirm password</label>
          <div className="kx-control">
            <input id="invite-password-2" className="kx-input" value={pw2} onChange={(e) => setPw2(e.target.value)} type={show ? "text" : "password"} autoComplete="new-password" placeholder="Repeat your password" />
          </div>
        </div>

        <div className="kx-auth-stack" style={{ marginTop: 24 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
          {notice && <div className="kx-alert kx-alert--success" role="status"><CheckCircle2 size={16} />{notice}</div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={loading}>
            {loading ? <><span className="kx-spinner" />Activating…</> : "Activate account"}
          </button>
        </div>
      </form>

      <div className="kx-auth-foot">
        <ShieldCheck size={16} />
        <span>Only numbers invited by the Super Admin can be activated.</span>
      </div>
    </AuthLayout>
  );
}
