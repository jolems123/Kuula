import { ArrowLeft, CheckCircle, Shield, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";

interface Props {
  onNavigate: (screen: string) => void;
}

declare global {
  interface Window {
    SmileIdentity?: (config: Record<string, unknown>) => void;
  }
}

const SMILE_SDK_URL = "https://cdn.usesmileid.com/inline/v12/js/script.min.js";

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
  // Pre-fill from the account created at sign-up so the user doesn't re-enter
  // their NIN and name. DOB is not captured at sign-up, so it starts empty.
  const [idNumber, setIdNumber] = useState(state.user?.nationalId ?? "");
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
        partner_details: {
          partner_id: verification.partnerId,
          name: "Kuula Microfinance",
          logo_url: `${window.location.origin}/kuula-logo.svg`,
          policy_url: verification.privacyPolicyUrl,
          theme_color: "#0B5E3A",
        },
        onResult: async (result: { status?: string }) => {
          if (result?.status === "cancelled") {
            setIsSubmitting(false);
            return;
          }
          if (result?.status !== "success") {
            setError("The ID capture could not be completed. Please try again in good light.");
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
      setError(e instanceof ApiError ? e.message : "Could not start identity verification. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white" style={{ paddingTop: 0 }}>
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={() => {
            if (step === 1) {
              onNavigate("create-account");
              return;
            }
            if (step === 2) {
              setStep(1);
              return;
            }
            onNavigate("welcome");
          }}
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 12, background: "#F3F4F6", border: "none" }}
        >
          <ArrowLeft size={18} color="#374151" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#1F2937", marginLeft: 12 }}>
          {t("kyc.title")}
        </span>
      </div>

      <div className="flex items-center px-6 py-4">
        {[{ label: t("kyc.stepId"), n: 1 }, { label: t("kyc.stepPhoto"), n: 2 }, { label: t("kyc.stepComplete"), n: 3 }].map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: step >= s.n ? "#0B5E3A" : "#F3F4F6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {step > s.n ? (
                  <CheckCircle size={16} color="white" />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: step >= s.n ? "white" : "#9CA3AF" }}>
                    {s.n}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, color: step >= s.n ? "#0B5E3A" : "#9CA3AF", marginTop: 4, fontWeight: 500 }}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: step > s.n ? "#0B5E3A" : "#E5E7EB",
                  margin: "0 8px",
                  marginBottom: 20,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 gap-5 overflow-y-auto pb-4">
        {step === 1 && (
          <>
            <div
              className="p-4 rounded-xl flex items-start gap-3"
              style={{ background: "#F3FAF7", border: "1px solid #DFF2E9" }}
            >
              <User size={18} color="#0B5E3A" style={{ marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{t("kyc.ninRequired")}</p>
                <p style={{ fontSize: 12, color: "#064A2E", marginTop: 2 }}>
                  {t("kyc.niraVerification")}
                </p>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
                {t("kyc.nationalIdLabel")}
              </label>
              <input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                maxLength={14}
                placeholder={t("kyc.ninPlaceholder")}
                style={{
                  width: "100%",
                  height: 52,
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  padding: "0 16px",
                  fontSize: 15,
                  color: "#1F2937",
                  background: "#F9FAFB",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                {t("kyc.ninHint")}
              </p>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
                {t("kyc.fullNameLabel")}
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("kyc.fullNamePlaceholder")}
                style={{
                  width: "100%",
                  height: 52,
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  padding: "0 16px",
                  fontSize: 15,
                  color: "#1F2937",
                  background: "#F9FAFB",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
                {t("kyc.dobLabel")}
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                style={{
                  width: "100%",
                  height: 52,
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  padding: "0 16px",
                  fontSize: 15,
                  color: "#1F2937",
                  background: "#F9FAFB",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div
              className="p-4 rounded-xl flex items-start gap-3"
              style={{ background: "#F3FAF7", border: "1px solid #DFF2E9" }}
            >
              <Shield size={18} color="#0B5E3A" style={{ marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Photograph your National ID</p>
                <p style={{ fontSize: 12, color: "#064A2E", marginTop: 2, lineHeight: 1.5 }}>
                  Our identity partner Smile ID will guide you through photographing the front and back of your
                  National ID and a short selfie check. The NIN printed on the card must match the NIN above.
                </p>
              </div>
            </div>

            <div
              className="p-3 rounded-xl flex gap-2"
              style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}
            >
              <span style={{ fontSize: 13, color: "#92400E" }}>
                💡 Use good light, place the card on a dark surface, and make sure all four corners are visible.
              </span>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-8">
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                background: "#F0FDF4",
                border: "2px solid #178654",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={40} color="#178654" />
            </div>
            <div className="text-center">
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937" }}>{t("kyc.submittedTitle")}</h2>
              <p style={{ fontSize: 14, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
                {t("kyc.submittedMessage")}
              </p>
            </div>
            <div
              className="p-4 rounded-xl w-full"
              style={{ background: "#F0FDF4", border: "1px solid #A7F3D0" }}
            >
              <p style={{ fontSize: 13, color: "#065F46", textAlign: "center" }}>
                ✓ {t("kyc.smsNotice")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-10 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 10 }}>
          {t("kyc.footerNote")}
        </p>
        <button
          disabled={isSubmitting}
          onClick={async () => {
            setError("");
            setSuccess("");

            if (step === 1) {
              if (!idNumber.trim() || !isValidUgandaNin(idNumber)) {
                setError("Please enter a valid 14-character National ID (NIN), e.g. CM8602410E8EWE.");
                return;
              }
              if (!fullName.trim() || fullName.trim().length < 2) {
                setError("Please enter your full legal name.");
                return;
              }
              if (!dob) {
                setError("Please select your date of birth.");
                return;
              }
              setStep(2);
              return;
            }

            if (step === 2) {
              await startCapture();
              return;
            }

            onNavigate("welcome");
          }}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: "linear-gradient(135deg, #0B5E3A, #064A2E)",
            color: "white",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            boxShadow: "0 4px 16px rgba(11,94,58,0.3)",
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? "Working..." : step === 2 ? "Start ID Capture" : step < 3 ? t("common.continue") : t("common.goToDashboard")}
        </button>
        {error ? (
          <p style={{ fontSize: 12, color: "#DC2626", textAlign: "center", marginTop: 10 }}>{error}</p>
        ) : null}
        {success ? (
          <p style={{ fontSize: 12, color: "#059669", textAlign: "center", marginTop: 10 }}>{success}</p>
        ) : null}
      </div>
    </div>
  );
}
