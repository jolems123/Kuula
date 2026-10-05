import { useState, type FormEvent } from "react";
import { Eye, EyeOff, AlertCircle, KeyRound } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError, type SessionPayload } from "../../api/client";
import { storeSessionTokens } from "../../lib/session-vault";
import { toUgandaPhone } from "../../lib/phone";
import { digitsOnly, newPinProblem, PIN_LENGTH } from "../../lib/pin";
import { AuthLayout } from "../auth/AuthLayout";
import { PasswordRecoveryScreen } from "./PasswordRecoveryScreen";

interface Props { onNavigate: (screen: string) => void; }

/**
 * Customer log in: phone number and 4-digit PIN. The password is a backup for
 * accounts created before PINs, and those accounts are offered a PIN on entry.
 */
export function LoginScreen({ onNavigate }: Props) {
  const { login } = useAppContext();
  const [phone, setPhone] = useState("");
  const [secret, setSecret] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  // Set once a password login succeeds on an account that has no PIN yet.
  const [pendingSession, setPendingSession] = useState<SessionPayload | null>(null);
  const [newPin, setNewPin] = useState("");

  if (recovering) return <PasswordRecoveryScreen onBack={() => setRecovering(false)} />;

  const enter = (session: SessionPayload) => {
    const expiresAt = Date.now() + (session.accessExpiresInSeconds ?? 900) * 1000;
    storeSessionTokens({ accessToken: session.token, refreshToken: session.refreshToken, accessExpiresAt: expiresAt });
    login(session.token, session.user, session.credit, session.loan, session.role, session.messages, session.unreadNotifications, expiresAt);
    onNavigate("home");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const identifier = toUgandaPhone(phone);
    if (!identifier) { setError("Enter the phone number you signed up with."); return; }
    if (usePassword ? !secret : secret.length !== PIN_LENGTH) {
      setError(usePassword ? "Enter your password." : `Enter your ${PIN_LENGTH}-digit PIN.`);
      return;
    }
    setBusy(true);
    try {
      const session = await api.login(identifier, secret);
      if (usePassword && session.user.hasPin === false) setPendingSession(session);
      else enter(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const createPin = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !pendingSession) return;
    setError("");
    const problem = newPinProblem(newPin);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await api.setCredentials(pendingSession.token, { current: secret, newPin });
      enter(pendingSession);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your PIN. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setUsePassword((value) => !value);
    setSecret("");
    setShowSecret(false);
    setError("");
  };

  const errorBox = error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>;

  if (pendingSession) {
    return (
      <AuthLayout onBack={() => enter(pendingSession)} backLabel="Skip for now">
        <div className="kx-auth-head">
          <div className="kx-auth-head__icon"><KeyRound size={22} /></div>
          <h2>Create your PIN</h2>
          <p>Next time, log in with your phone number and this {PIN_LENGTH}-digit PIN. Your password stays as a backup.</p>
        </div>
        <form onSubmit={createPin} noValidate>
          <div className="kx-field">
            <label className="kx-label" htmlFor="login-new-pin">New {PIN_LENGTH}-digit PIN</label>
            <div className="kx-control">
              <input id="login-new-pin" className="kx-input" value={newPin} onChange={(e) => setNewPin(digitsOnly(e.target.value))} type={showSecret ? "text" : "password"} inputMode="numeric" maxLength={PIN_LENGTH} autoComplete="new-password" placeholder="4 digits" style={{ letterSpacing: ".3em" }} autoFocus />
              <button type="button" className="kx-control__action" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? "Hide PIN" : "Show PIN"}>
                {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className="kx-hint">Don't reuse your Mobile Money PIN.</span>
          </div>
          <div className="kx-auth-stack" style={{ marginTop: 22 }}>
            {errorBox}
            <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={busy}>
              {busy ? <><span className="kx-spinner" />Saving…</> : "Save PIN and continue"}
            </button>
          </div>
        </form>
        <div className="kx-auth-foot">
          <button type="button" className="kx-link" onClick={() => enter(pendingSession)} disabled={busy}>Skip for now</button>
        </div>
      </AuthLayout>
    );
  }

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
          <label className="kx-label" htmlFor="login-secret">{usePassword ? "Password" : "PIN"}</label>
          <div className="kx-control">
            {usePassword ? (
              <input id="login-secret" className="kx-input" value={secret} onChange={(e) => setSecret(e.target.value)} type={showSecret ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" />
            ) : (
              <input id="login-secret" className="kx-input" value={secret} onChange={(e) => setSecret(digitsOnly(e.target.value))} type={showSecret ? "text" : "password"} inputMode="numeric" maxLength={PIN_LENGTH} autoComplete="current-password" placeholder="4 digits" style={{ letterSpacing: ".3em" }} />
            )}
            <button type="button" className="kx-control__action" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? "Hide" : "Show"}>
              {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="kx-auth-row">
          <button type="button" className="kx-link" onClick={switchMode}>{usePassword ? "Use PIN instead" : "Use password instead"}</button>
          <button type="button" className="kx-link" onClick={() => setRecovering(true)}>Forgot PIN?</button>
        </div>

        <div className="kx-auth-stack">
          {errorBox}
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
