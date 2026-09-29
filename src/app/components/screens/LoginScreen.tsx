import { useState, type FormEvent } from "react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { storeSessionTokens } from "../../lib/session-vault";
import { toUgandaPhone } from "../../lib/phone";
import { AuthLayout } from "../auth/AuthLayout";
import { PasswordRecoveryScreen } from "./PasswordRecoveryScreen";

interface Props { onNavigate: (screen: string) => void; }

/** Customer log in: phone number and password, nothing else. */
export function LoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);

  if (recovering) return <PasswordRecoveryScreen onBack={() => setRecovering(false)} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const identifier = toUgandaPhone(phone);
    if (!identifier || !password) { setError("Enter your phone number and password."); return; }
    setBusy(true);
    try {
      const session = await api.login(identifier, password);
      const expiresAt = Date.now() + (session.accessExpiresInSeconds ?? 900) * 1000;
      storeSessionTokens({ accessToken: session.token, refreshToken: session.refreshToken, accessExpiresAt: expiresAt });
      login(session.token, session.user, session.credit, session.loan, session.role, session.messages, session.unreadNotifications, expiresAt);
      onNavigate("home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout onBack={() => onNavigate("welcome")}>
      <div className="kx-auth-head">
        <h2>Log in</h2>
        <p>Use the phone number you signed up with.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="kx-field">
          <label className="kx-label" htmlFor="login-phone">Phone number</label>
          <div className="kx-control">
            <span className="kx-control__prefix">+256</span>
            <input id="login-phone" className="kx-input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="username" placeholder="7XX XXX XXX" />
          </div>
        </div>

        <div className="kx-field">
          <label className="kx-label" htmlFor="login-password">Password</label>
          <div className="kx-control">
            <input id="login-password" className="kx-input" value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" />
            <button type="button" className="kx-control__action" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="kx-auth-row kx-auth-row--end">
          <button type="button" className="kx-link" onClick={() => setRecovering(true)}>Forgot password?</button>
        </div>

        <div className="kx-auth-stack">
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={busy}>
            {busy ? <><span className="kx-spinner" />Logging in…</> : "Log in"}
          </button>
        </div>
      </form>

      <div className="kx-auth-foot">
        <span>New to Kuula?</span>
        <button type="button" className="kx-link" onClick={() => onNavigate("create-account")}>Create an account</button>
      </div>
    </AuthLayout>
  );
}
