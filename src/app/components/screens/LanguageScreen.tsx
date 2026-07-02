import { useState, useEffect } from "react";
import { ArrowLeft, Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { APP_LANGUAGES, BUNDLED_LANGS, type LanguageCode } from "../../../i18n";

interface Props {
  onNavigate: (screen: string) => void;
}

export function LanguageScreen({ onNavigate }: Props) {
  const { i18n, t } = useTranslation();
  const [current, setCurrent] = useState<LanguageCode>(i18n.language as LanguageCode);

  useEffect(() => {
    setCurrent(i18n.language as LanguageCode);
  }, [i18n.language]);

  const handleSelect = (code: LanguageCode) => {
    if (BUNDLED_LANGS.includes(code)) {
      i18n.changeLanguage(code);
      setCurrent(code);
    }
    // For non-bundled languages, we still save the preference so when
    // translations are added later, the user's choice is remembered.
    i18n.changeLanguage(code);
    setCurrent(code);
  };

  const bundled = APP_LANGUAGES.filter((l) => BUNDLED_LANGS.includes(l.code as LanguageCode));
  const comingSoon = APP_LANGUAGES.filter((l) => !BUNDLED_LANGS.includes(l.code as LanguageCode));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 16px 14px",
          background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)",
        }}
      >
        <button
          onClick={() => onNavigate("welcome")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.2)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>
          {t("language.title")}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/* Intro text */}
        <div style={{ textAlign: "center", marginBottom: 20, padding: "0 8px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: "linear-gradient(135deg, #ECF5F0, #D2E9DD)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              border: "2px solid #B6DCC8",
            }}
          >
            <Globe size={28} color="#0D5C3A" />
          </div>
          <p style={{ fontSize: 14, color: "#1F2937", fontWeight: 600, margin: "0 0 4px" }}>
            {t("language.subtitle")}
          </p>
          <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
            {t("language.appWillChange")}
          </p>
        </div>

        {/* Bundled languages (fully translated) */}
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          {t("language.currentLang")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {bundled.map((lang) => {
            const isActive = current === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code as LanguageCode)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: isActive ? "linear-gradient(135deg, #0D5C3A, #0A4A2E)" : "white",
                  border: isActive ? "none" : "1.5px solid #E5E7EB",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: isActive ? "rgba(255,255,255,0.2)" : "#F3F4F6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>
                      {lang.code === "en" ? "🇬🇧" : lang.code === "lg" ? "🇺🇬" : "🇹🇿"}
                    </span>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: isActive ? "white" : "#1F2937", margin: 0 }}>
                      {lang.native}
                    </p>
                    <p style={{ fontSize: 11, color: isActive ? "rgba(255,255,255,0.7)" : "#9CA3AF", margin: "2px 0 0" }}>
                      {lang.label}
                    </p>
                  </div>
                </div>
                {isActive && <Check size={18} color="white" />}
              </button>
            );
          })}
        </div>

        {/* Coming soon languages */}
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          {t("language.otherLangs")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {comingSoon.map((lang) => {
            const isActive = current === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code as LanguageCode)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: isActive ? "#F0FDF4" : "white",
                  border: isActive ? "1.5px solid #A7F3D0" : "1.5px solid #E5E7EB",
                  cursor: "pointer",
                  opacity: 0.7,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: "#F3F4F6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🇺🇬</span>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>
                      {lang.native}
                    </p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                      {lang.label}
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", background: "#F3F4F6", padding: "3px 8px", borderRadius: 8 }}>
                  SOON
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}