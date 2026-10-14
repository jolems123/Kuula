import { Eye, EyeOff, UserRoundCheck, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { AuthLayout } from "../auth/AuthLayout";

interface Props { onNavigate: (s: string) => void; }

/** Password-only staff signup, followed by independent Super Admin approval. */
export function AdminActivateScreen({ onNavigate }: Props) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (loading || notice) return;
    setError(""); setNotice("");
    const staffEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail)) { setError("Enter the work email address the invitation was sent to."); return; }
    if (pw.length < 8 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setError("Password must be 8–72 characters with a letter and a number."); return; }
    if (pw !== pw2) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const result = await api.staffSignUp(staffEmail, pw, pw2);
      setPw(""); setPw2("");
      setNotice(result.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create your account. Try again.");
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout logoSubtitle="Staff portal" onBack={() => onNavigate("admin-login")} backLabel="Back to sign in">
      <div className="kx-auth-head">
        <div className="kx-auth-head__icon"><UserRoundCheck size={22} /></div>
        <h2>Create your staff account</h2>
        <p>Enter your work email, choose a password, and confirm it.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="kx-field">
          <label className="kx-label" htmlFor="invite-phone">Work email address</label>
          <div className="kx-control">
            <input id="invite-phone" className="kx-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@kuulapp.com" autoFocus />
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
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={loading || Boolean(notice)}>
            {loading ? <><span className="kx-spinner" />Creating account…</> : "Create account"}
          </button>
          <button type="button" className="kx-link" onClick={() => onNavigate("admin-login")}>Already have an account? Sign in</button>
        </div>
      </form>

      <div className="kx-auth-foot">
        <ShieldCheck size={16} />
        <span>Your work email must be added by the Super Admin. Staff access requires their approval after signup.</span>
      </div>
    </AuthLayout>
  );
}
