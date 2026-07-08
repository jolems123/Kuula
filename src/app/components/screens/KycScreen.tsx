import { ArrowLeft, Camera, CheckCircle, Circle, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  onNavigate: (screen: string) => void;
}

export function KycScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [idNumber, setIdNumber] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [step, setStep] = useState(1);

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
                  background: step >= s.n ? "#FF6B35" : "#F3F4F6",
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
              <span style={{ fontSize: 10, color: step >= s.n ? "#FF6B35" : "#9CA3AF", marginTop: 4, fontWeight: 500 }}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: step > s.n ? "#FF6B35" : "#E5E7EB",
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
              style={{ background: "#FFF0E8", border: "1px solid #FFDCC8" }}
            >
              <User size={18} color="#FF6B35" style={{ marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#083A24" }}>{t("kyc.ninRequired")}</p>
                <p style={{ fontSize: 12, color: "#157A4E", marginTop: 2 }}>
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
            <button
              onClick={() => setUploaded(true)}
              style={{
                width: "100%",
                height: 160,
                borderRadius: 16,
                border: uploaded ? "2px solid #10B981" : "2px dashed #D1D5DB",
                background: uploaded ? "#F0FDF4" : "#F9FAFB",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                cursor: "pointer",
              }}
            >
              {uploaded ? (
                <>
                  <CheckCircle size={40} color="#10B981" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#065F46" }}>{t("kyc.photoUploaded")}</span>
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
                border: "2px solid #10B981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={40} color="#10B981" />
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
          onClick={() => {
            if (step < 3) setStep(step + 1);
            else onNavigate("home");
          }}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: "linear-gradient(135deg, #FF6B35, #E05A2B)",
            color: "white",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            boxShadow: "0 4px 16px rgba(13,92,58,0.3)",
          }}
        >
          {step < 3 ? t("common.continue") : t("common.goToDashboard")}
        </button>
      </div>
    </div>
  );
}
