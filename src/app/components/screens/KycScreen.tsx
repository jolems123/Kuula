import { AlertCircle, ArrowRight, Camera, CheckCircle, Shield, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";

import { AuthLayout } from "../auth/AuthLayout";

interface Props {
  onNavigate: (screen: string) => void;
}

declare global {
  interface Window {
    SmileIdentity?: (config: Record<string, unknown>) => void;
  }
}

const SMILE_SDK_URL = "https://cdn.usesmileid.com/inline/v12/js/script.min.js";

interface SmileResult {
  status?: "success" | "failure" | "cancelled";
  error?: { error_code?: string; message?: string; retryable?: boolean };
}

/** Smile ID's failure codes, in words a customer can act on. Every one can be retried from this step. */
function captureFailureMessage(code: string | undefined): string {
  switch (code) {
    case "CONSENT_DENIED":
      return "We need your consent to check your ID. Tap Start ID capture and allow it to continue.";
    case "DOCUMENTS_REJECTED":
      return "The photos were not clear enough. Use good light, keep all four corners of your National ID visible, and try again.";
    case "NOT_PERMITTED":
      return "That document cannot be used. Please use your original Uganda National ID.";
    case "SESSION_INIT_FAILED":
      return "We could not open your camera. Allow camera access for this site, then try again.";
    case "SUBMISSION_FAILED":
      return "Your photos could not be sent. Check your connection and try again.";
    default:
      return "The ID capture could not be completed. Please try again.";
  }
}

let smileSdkPromise: Promise<void> | null = null;
function loadSmileSdk(): Promise<void> {
  if (window.SmileIdentity) return Promise.resolve();
  if (!smileSdkPromise) {
    smileSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SMILE_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        smileSdkPromise = null;
        reject(new Error("Could not load the identity verification service. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return smileSdkPromise;
}

/**
 * Customer identity verification.
 *
 * The customer states their NIN, name, and birth date, then photographs their
 * national ID inside Smile ID's hosted capture (document front/back, selfie,
 * and a liveness sequence). Smile ID authenticates the document and reads the
 * NIN printed on it — a stated NIN that does not match the document is
 * rejected by the server when the verdict webhook arrives.
 */
export function KycScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  // Session responses mask the NIN. Never prefill masked text as a valid ID.
  const [idNumber, setIdNumber] = useState(() => isValidUgandaNin(state.user?.nationalId ?? "") ? state.user!.nationalId : "");
  const [fullName, setFullName] = useState(state.user?.fullName ?? "");
  const [dob, setDob] = useState(state.user?.dateOfBirth ?? "");

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = () => {
    if (state.session.token) return state.session.token;
    try {
      return (
        localStorage.getItem("kuula_auth_token") ||
        localStorage.getItem("token") ||
        sessionStorage.getItem("kuula_auth_token") ||
        sessionStorage.getItem("token") ||
        ""
      );
    } catch {
      return "";
    }
  };

  /** The webhook usually lands within seconds; poll briefly before falling back to "under review". */
  const pollForVerdict = async (token: string): Promise<"verified" | "rejected" | "pending"> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const { kyc } = await api.getKycStatus(token);
        const status = String((kyc as { status?: string }).status ?? "");
        if (status === "verified") return "verified";
        if (status === "rejected") return "rejected";
      } catch {
        // Keep polling — a transient network error is not a verdict.
      }
    }
    return "pending";
  };

  const startCapture = async () => {
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please log in again.");
      setTimeout(() => onNavigate("welcome"), 300);
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const { verification } = await api.startDocumentVerification(token, {
        nationalId: normalizeNin(idNumber),
        fullName: fullName.trim(),
        dob,
      });
      await loadSmileSdk();

      window.SmileIdentity!({
        token: verification.token,
        product: "doc_verification",
        callback_url: verification.callbackUrl,
        environment: verification.environment,
        // Only the National ID carries the NIN we match against the account.
        id_selection: { UG: ["IDENTITY_CARD"] },
        // Kuula already holds the customer's name and phone: skip Smile ID's
        // details form (which would also ask for an email Kuula does not use).
        ...(verification.userDetails ? { user_details: verification.userDetails } : {}),
        partner_details: {
          partner_id: verification.partnerId,
          name: "Kuula Microfinance",
          logo_url: `${window.location.origin}/kuula-logo.svg`,
          policy_url: verification.privacyPolicyUrl,
          theme_color: "#0B5E3A",
        },
        onResult: async (result: SmileResult) => {
          if (result?.status === "cancelled") {
            // Closing the capture is a choice, not a failure: stay on this step, ready to restart.
            setIsSubmitting(false);
            return;
          }
          if (result?.status !== "success") {
            setError(captureFailureMessage(result?.error?.error_code));
            setIsSubmitting(false);
            return;
          }
          setSuccess("Documents received — confirming with the identity service…");
          const verdict = await pollForVerdict(token);
          setIsSubmitting(false);
          if (verdict === "rejected") {
            setSuccess("");
            setError("We could not verify that ID. Make sure the NIN matches your account and the document photo is clear, then try again.");
            return;
          }
          setStep(3);
        },
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not start identity verification. Please try again.");
      setIsSubmitting(false);
    }
  };

  const continueVerification = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setSuccess("");
    if (step === 1) {
      if (!isValidUgandaNin(idNumber)) { setError("Enter the 14-character NIN from your National ID."); return; }
      if (fullName.trim().length < 2) { setError("Please enter your full legal name."); return; }
      if (!dob) { setError("Please select your date of birth."); return; }
      setStep(2);
    } else if (step === 2) {
      await startCapture();
    } else {
      onNavigate("home");
    }
  };

  return (
    <AuthLayout onBack={() => {
      if (isSubmitting) return;
      setError("");
      setSuccess("");
      if (step === 2) setStep(1);
      else onNavigate("home");
    }} backLabel={step === 2 ? "Back to your ID details" : "Back to dashboard"}>
      <div className="kx-steps" aria-label={`Step ${step} of 3`}>
        <div className="kx-steps__bars" aria-hidden="true">
          {[1, 2, 3].map((n) => <span key={n} className={step >= n ? "is-done" : ""} />)}
        </div>
        {step === 1 ? t("kyc.stepId") : step === 2 ? t("kyc.stepPhoto") : t("kyc.stepComplete")} · {step}/3
      </div>
      <form onSubmit={continueVerification} noValidate aria-busy={isSubmitting}>
        <div key={step} className="kx-step-enter">
          <div className="kx-auth-head">
            <div className="kx-auth-head__icon" aria-hidden="true">
              {step === 1 ? <User size={22} /> : step === 2 ? <Camera size={22} /> : <CheckCircle size={22} />}
            </div>
            <h2>{step === 1 ? t("kyc.title") : step === 2 ? "Photograph your National ID" : t("kyc.submittedTitle")}</h2>
            <p>{step === 1 ? "Confirm the details on your National ID to continue." : step === 2 ? "Have your original card ready. We'll guide you through each photo." : t("kyc.submittedMessage")}</p>
          </div>
          {step === 1 && <>
            <div className="kx-field">
              <label className="kx-label" htmlFor="kyc-nin">{t("kyc.nationalIdLabel")}</label>
              <div className="kx-control"><input id="kyc-nin" className="kx-input" value={idNumber} onChange={(e) => setIdNumber(normalizeNin(e.target.value))} maxLength={14} autoCapitalize="characters" autoComplete="off" placeholder={t("kyc.ninPlaceholder")} aria-describedby="kyc-nin-hint" /></div>
              <p id="kyc-nin-hint" className="kx-hint">{t("kyc.ninHint")}</p>
            </div>
            <div className="kx-field">
              <label className="kx-label" htmlFor="kyc-name">{t("kyc.fullNameLabel")}</label>
              <div className="kx-control"><input id="kyc-name" className="kx-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder={t("kyc.fullNamePlaceholder")} /></div>
            </div>
            <div className="kx-field">
              <label className="kx-label" htmlFor="kyc-dob">{t("kyc.dobLabel")}</label>
              <div className="kx-control"><input id="kyc-dob" className="kx-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" style={{ colorScheme: "dark" }} /></div>
            </div>
          </>}
          {step === 2 && <div className="kx-auth-stack">
            <div className="kx-alert kx-alert--info"><Shield size={20} /><span>Smile ID will capture the front and back of your National ID, then a short selfie check. The NIN on the card must match your account.</span></div>
            <div className="kx-alert kx-alert--info"><Camera size={20} /><span>Use good light, place your card on a dark surface, and keep all four corners visible.</span></div>
          </div>}
          {step === 3 && <div className="kx-alert kx-alert--success"><CheckCircle size={20} /><span>{t("kyc.smsNotice")}</span></div>}
        </div>
        <div className="kx-auth-stack" style={{ marginTop: 24 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
          {success && <div className="kx-alert kx-alert--info" role="status"><Shield size={16} /><span>{success}</span></div>}
          <button type="submit" disabled={isSubmitting} className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block">
            {isSubmitting ? <><span className="kx-spinner" aria-hidden="true" /> Working...</> : <>{step === 2 ? "Start ID capture" : step === 1 ? t("common.continue") : t("common.goToDashboard")}<ArrowRight size={18} /></>}
          </button>
        </div>
        <div className="kx-auth-foot"><Shield size={16} /><span>{t("kyc.footerNote")}</span></div>
      </form>
    </AuthLayout>
  );
}
