import { useState, type FormEvent } from "react";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";
import { toUgandaPhone } from "../../lib/phone";
import { digitsOnly, newPinProblem, PIN_LENGTH } from "../../lib/pin";
import { AuthLayout } from "../auth/AuthLayout";

interface Props { onNavigate: (screen: string) => void; }

export const CURRENT_PUBLIC_TERMS_VERSION = "2026-08-20";

/**
 * Two short steps instead of one long form. Everything the server requires
 * (name, NIN, phone, PIN, terms) is still collected. Customers sign in with
 * their phone number and a 6-digit PIN; there is no email.
 */
export function SignUpScreen({ onNavigate }: Props) {
  const { setPendingPhone } = useAppContext();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [nin, setNin] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const continueToAccount = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2) { setError("Enter your full name as it appears on your National ID."); return; }
    if (!isValidUgandaNin(normalizeNin(nin))) { setError("Enter the 14-character NIN from your National ID."); return; }
    setStep(2);
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const fullPhone = toUgandaPhone(phone);
    if (!/^\+2567\d{8}$/.test(fullPhone)) { setError("Enter a Uganda mobile number, for example 7XX XXX XXX."); return; }
    const pinProblem = newPinProblem(pin);
    if (pinProblem) { setError(pinProblem); return; }
    if (!accepted) { setError("Accept the Terms of Service and Privacy Notice to continue."); return; }

    setBusy(true);
    try {
      await api.signUp({
        name: name.trim(),
        phone: fullPhone,
        pin,
        nationalId: normalizeNin(nin),
        acceptedTerms: true,
        termsVersion: CURRENT_PUBLIC_TERMS_VERSION,
      });
      setPendingPhone(fullPhone);
      onNavigate("phone-verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError("");
    if (step === 2) setStep(1);
    else onNavigate("welcome");
  };

  return (
    <AuthLayout onBack={back} backLabel={step === 2 ? "Back to your details" : "Go back"}>
      <div className="kx-steps" aria-label={`Step ${step} of 2`}>
        <div className="kx-steps__bars"><span className="is-done" /><span className={step === 2 ? "is-done" : ""} /></div>
        Step {step} of 2
      </div>

      {step === 1 ? (
        <form key="details" className="kx-step-enter" onSubmit={continueToAccount} noValidate>
          <div className="kx-auth-head">
            <h2>Create your account</h2>
            <p>Start with the details on your National ID.</p>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="signup-name">Full name</label>
            <div className="kx-control">
              <input id="signup-name" className="kx-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Nakato Aisha" />
            </div>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="signup-nin">National ID number (NIN)</label>
            <div className="kx-control">
              <input id="signup-nin" className="kx-input" value={nin} onChange={(e) => setNin(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 14))} autoCapitalize="characters" autoComplete="off" placeholder="14 characters, e.g. CM90…" style={{ letterSpacing: ".04em" }} />
            </div>
          </div>
          <div className="kx-auth-stack" style={{ marginTop: 24 }}>
            {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
            <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block">Continue <ArrowRight size={18} /></button>
          </div>
        </form>
      ) : (
        <form key="account" className="kx-step-enter" onSubmit={createAccount} noValidate>
          <div className="kx-auth-head">
            <h2>Secure your account</h2>
            <p>We'll text a code to this number to confirm it's yours.</p>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="signup-phone">Phone number</label>
            <div className="kx-control">
              <span className="kx-control__prefix">+256</span>
              <input id="signup-phone" className="kx-input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="7XX XXX XXX" autoFocus />
            </div>
          </div>
          <div className="kx-field">
            <label className="kx-label" htmlFor="signup-pin">Create a {PIN_LENGTH}-digit PIN</label>
            <div className="kx-control">
              <input id="signup-pin" className="kx-input" value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))} type={showPin ? "text" : "password"} inputMode="numeric" maxLength={PIN_LENGTH} autoComplete="new-password" placeholder="6 digits" style={{ letterSpacing: ".3em" }} />
              <button type="button" className="kx-control__action" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className="kx-hint">You'll use this PIN to log in. Don't reuse your Mobile Money PIN.</span>
          </div>
          <label className="kx-terms" style={{ marginTop: 18 }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              I accept Kuula's{" "}
              <button type="button" className="kx-link" onClick={(e) => { e.preventDefault(); onNavigate("customer-terms"); }}>Terms of Service</button>
              {" "}and{" "}
              <button type="button" className="kx-link" onClick={(e) => { e.preventDefault(); onNavigate("customer-privacy-policy"); }}>Privacy Notice</button>.
            </span>
          </label>
          <div className="kx-auth-stack" style={{ marginTop: 22 }}>
            {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
            <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={busy}>
              {busy ? <><span className="kx-spinner" />Creating account…</> : "Create account"}
            </button>
          </div>
        </form>
      )}

      <div className="kx-auth-foot">
        <span>Already have an account?</span>
        <button type="button" className="kx-link" onClick={() => onNavigate("login")}>Log in</button>
      </div>
    </AuthLayout>
  );
}
