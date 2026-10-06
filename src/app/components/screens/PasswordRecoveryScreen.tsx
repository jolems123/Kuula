import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Eye, EyeOff, AlertCircle } from "lucide-react";
import { authRecoveryApi } from "../../api/auth-recovery";
import { ApiError } from "../../api/types";
import { toUgandaPhone } from "../../lib/phone";
import { digitsOnly, newPinProblem, PIN_LENGTH } from "../../lib/pin";
import { AuthLayout } from "../auth/AuthLayout";

interface Props { onBack: () => void; }

type Step = "request" | "confirm" | "done";

/** "Forgot PIN": an SMS code proves the phone, then the customer chooses a new PIN. */
export function PasswordRecoveryScreen({ onBack }: Props) {
  const [step, setStep] = useState<Step>("request");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const identifier = toUgandaPhone(phone);

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    if (!identifier) { setError("Enter the phone number on your Kuula account."); return; }
    setBusy(true);
    try {
      const result = await authRecoveryApi.requestPasswordReset(identifier);
      setMessage(result.message);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request a reset code.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit SMS code."); return; }
    const pinProblem = newPinProblem(newPin);
    if (pinProblem) { setError(pinProblem); return; }
    setBusy(true);
    try {
      const result = await authRecoveryApi.confirmPinReset(identifier, code, newPin);
      setMessage(result.message);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your PIN. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>;

  return (
    <AuthLayout onBack={onBack} backLabel="Back to log in">
      {step === "request" && (
        <div className="kx-step-enter">
          <div className="kx-auth-head">
            <div className="kx-auth-head__icon"><KeyRound size={22} /></div>
            <h2>Reset your PIN</h2>
            <p>We'll text a code to the phone number on your account.</p>
          </div>
          <form onSubmit={requestCode} noValidate>
            <div className="kx-field">
              <label className="kx-label" htmlFor="recover-phone">Phone number</label>
              <div className="kx-control">
                <span className="kx-control__prefix">+256</span>
                <input id="recover-phone" className="kx-input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="username" placeholder="7XX XXX XXX" autoFocus />
              </div>
            </div>
            <div className="kx-auth-stack" style={{ marginTop: 22 }}>
              {errorBox}
              <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={busy}>
                {busy ? <><span className="kx-spinner" />Sending…</> : "Send code"}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "confirm" && (
        <div className="kx-step-enter">
          <div className="kx-auth-head">
            <div className="kx-auth-head__icon"><KeyRound size={22} /></div>
            <h2>Choose a new PIN</h2>
            <p>{message || "Enter the code we sent by SMS."}</p>
          </div>
          <form onSubmit={confirmReset} noValidate>
            <div className="kx-field">
              <label className="kx-label" htmlFor="recover-code">SMS code</label>
              <div className="kx-control">
                <input id="recover-code" className="kx-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" autoFocus />
              </div>
            </div>
            <div className="kx-field">
              <label className="kx-label" htmlFor="recover-pin">New {PIN_LENGTH}-digit PIN</label>
              <div className="kx-control">
                <input id="recover-pin" className="kx-input" value={newPin} onChange={(e) => setNewPin(digitsOnly(e.target.value))} type={showPin ? "text" : "password"} inputMode="numeric" maxLength={PIN_LENGTH} autoComplete="new-password" placeholder="4 digits" style={{ letterSpacing: ".3em" }} />
                <button type="button" className="kx-control__action" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <span className="kx-hint">Don't reuse your Mobile Money PIN.</span>
            </div>
            <div className="kx-auth-stack" style={{ marginTop: 22 }}>
              {errorBox}
              <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={busy}>
                {busy ? <><span className="kx-spinner" />Saving…</> : "Save new PIN"}
              </button>
            </div>
          </form>
          <div className="kx-auth-foot">
            <span>Didn't get a code?</span>
            <button type="button" className="kx-link" onClick={() => { void requestCode(); }} disabled={busy}>Send another</button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="kx-step-enter">
          <div className="kx-auth-head">
            <div className="kx-auth-head__icon"><ShieldCheck size={22} /></div>
            <h2>PIN updated</h2>
            <p>{message || "You can now log in with your new PIN."}</p>
          </div>
          <button type="button" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" onClick={onBack}>Back to log in</button>
        </div>
      )}
    </AuthLayout>
  );
}
