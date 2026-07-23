import { ArrowLeft, Camera, CheckCircle, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";

interface Props {
  onNavigate: (screen: string) => void;
}

export function KycScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [idNumber, setIdNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = useMemo(() => {
    try {
      return localStorage.getItem("kuula_auth_token") || sessionStorage.getItem("kuula_auth_token") || "";
    } catch {
      return "";
    }
  }, []);

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const ALLOWED_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/jpg", "image/webp"]);

  const onPickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (file?: File) => {
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setError("Only JPG, PNG, or WEBP images are allowed.");
      setUploaded(false);
      setSelectedFile(null);
      setPreviewUrl("");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Image is too large. Please upload a file up to 5MB.");
      setUploaded(false);
      setSelectedFile(null);
      setPreviewUrl("");
      return;
    }

    setError("");
    setSelectedFile(file);
    setUploaded(true);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  return (
    <div className="flex flex-col h-full bg-white" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={() => onNavigate("welcome")}
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 12, background: "#F3F4F6", border: "none" }}
        >
          <ArrowLeft size={18} color="#374151" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#1F2937", marginLeft: 12 }}>
          {t("kyc.title")}
        </span>
      </div>

      {/* Progress steps */}
      <div className="flex items-center px-6 py-4">
        {[{ label: t("kyc.stepId"), n: 1 }, { label: t("kyc.stepPhoto"), n: 2 }, { label: t("kyc.stepComplete"), n: 3 }].map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: step >= s.n ? "#F4612B" : "#F3F4F6",
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
              <span style={{ fontSize: 10, color: step >= s.n ? "#F4612B" : "#9CA3AF", marginTop: 4, fontWeight: 500 }}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: step > s.n ? "#F4612B" : "#E5E7EB",
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
              style={{ background: "#FFF6EF", border: "1px solid #FFDCC8" }}
            >
              <User size={18} color="#F4612B" style={{ marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{t("kyc.ninRequired")}</p>
                <p style={{ fontSize: 12, color: "#D9531F", marginTop: 2 }}>
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
                onChange={(e) => setIdNumber(e.target.value)}
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
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>
              {t("kyc.uploadInstruction")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => onFileSelected(e.target.files?.[0])}
            />
            <button
              onClick={onPickFile}
              style={{
                width: "100%",
                minHeight: 160,
                borderRadius: 16,
                border: uploaded ? "2px solid #12B984" : "2px dashed #D1D5DB",
                background: uploaded ? "#F0FDF4" : "#F9FAFB",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: "pointer",
                overflow: "hidden",
                padding: 10,
              }}
            >
              {uploaded && previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt="Uploaded ID preview"
                    style={{ width: "100%", maxHeight: 110, objectFit: "cover", borderRadius: 10, border: "1px solid #A7F3D0" }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#065F46" }}>
                    {selectedFile?.name || t("kyc.photoUploaded")}
                  </span>
                </>
              ) : (
                <>
                  <Camera size={40} color="#9CA3AF" />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#6B7280" }}>{t("kyc.tapToUpload")}</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("kyc.fileHint")}</span>
                </>
              )}
            </button>

            <div
              className="p-3 rounded-xl flex gap-2"
              style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}
            >
              <span style={{ fontSize: 13, color: "#92400E" }}>
                💡 {t("kyc.uploadTip")}
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
                border: "2px solid #12B984",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={40} color="#12B984" />
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
          onClick={async () => {
            setError("");
            setSuccess("");

            if (step === 1) {
              if (!idNumber.trim() || idNumber.trim().length < 6) {
                setError("Please enter a valid National ID number.");
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
              if (!uploaded) {
                setError("Please upload your ID photo before continuing.");
                return;
              }
              if (!token) {
                setError("Your session has expired. Please log in again.");
                return;
              }

              try {
                setIsSubmitting(true);
                await api.submitKyc(token, {
                  nationalId: idNumber.trim(),
                  fullName: fullName.trim(),
                  dob,
                  documentType: selectedFile ? selectedFile.type || "id-photo" : "id-photo",
                  documentRef: selectedFile ? selectedFile.name : "",
                });
                setSuccess("KYC submitted successfully. We will review and notify you.");
                setStep(3);
              } catch (e) {
                const message = e instanceof ApiError ? e.message : "Could not submit KYC. Please try again.";
                setError(message);
              } finally {
                setIsSubmitting(false);
              }
              return;
            }

            onNavigate("home");
          }}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: "linear-gradient(135deg, #F4612B, #D9531F)",
            color: "white",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            boxShadow: "0 4px 16px rgba(255,107,53,0.3)",
          }}
        >
          {isSubmitting ? "Submitting..." : step < 3 ? t("common.continue") : t("common.goToDashboard")}
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
