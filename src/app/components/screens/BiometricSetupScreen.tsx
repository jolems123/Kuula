import { ArrowLeft, Fingerprint, Scan, ShieldCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function BiometricSetupScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<"fingerprint" | "face" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);

  const scan = () => {
    if (!selected) return;
    setScanning(true);
    setTimeout(() => { setScanning(false); setDone(true); }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <button onClick={() => onNavigate("phone-verify")} style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="#374151" />
        </button>
        <div style={{ marginLeft: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#1F2937", display: "block" }}>{t("biometricSetup.title")}</span>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{t("biometricSetup.optionalSkip")}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px", gap: 20, flex: 1 }}>
        {/* Hero */}
        <div style={{ width: 96, height: 96, borderRadius: 48, background: done ? "#F0FDF4" : "#FFF0E8", border: `2px solid ${done ? "#10B981" : "#FFDCC8"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done
            ? <ShieldCheck size={48} color="#10B981" strokeWidth={1.5} />
            : scanning
            ? <div style={{ width: 44, height: 44, border: "3px solid #FFDCC8", borderTopColor: "#FF6B35", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            : selected === "face"
            ? <Scan size={48} color="#FF6B35" strokeWidth={1.5} />
            : <Fingerprint size={48} color={selected ? "#FF6B35" : "#9CA3AF"} strokeWidth={1.5} />
          }
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: "#1F2937", margin: 0 }}>
            {done ? t("biometricSetup.readyTitle") : t("biometricSetup.secureTitle")}
          </h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
            {done ? t("biometricSetup.readyMessage") : t("biometricSetup.secureMessage")}
          </p>
        </div>

        {!done && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { id: "fingerprint" as const, Icon: Fingerprint, label: t("biometricSetup.fingerprintLabel"), sub: t("biometricSetup.fingerprintSub") },
              { id: "face" as const, Icon: Scan, label: t("biometricSetup.faceLabel"), sub: t("biometricSetup.faceSub") },
            ].map(({ id, Icon, label, sub }) => (
              <button
                key={id}
                onClick={() => setSelected(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14,
                  background: selected === id ? "#FFF0E8" : "#F9FAFB",
                  border: `2px solid ${selected === id ? "#FF6B35" : "#E5E7EB"}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <Icon size={28} color={selected === id ? "#FF6B35" : "#9CA3AF"} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: selected === id ? "#374151" : "#1F2937", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${selected === id ? "#FF6B35" : "#D1D5DB"}`, background: selected === id ? "#FF6B35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selected === id && <div style={{ width: 8, height: 8, borderRadius: 4, background: "white" }} />}
                </div>
              </button>
            ))}
          </div>
        )}

        {done && (
          <div style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: "#F0FDF4", border: "1px solid #A7F3D0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#065F46", fontWeight: 600, margin: 0 }}>✓ {t("biometricSetup.registered")}</p>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 20px 36px", background: "white", borderTop: "1px solid #F3F4F6", display: "flex", flexDirection: "column", gap: 10 }}>
        {done ? (
          <button onClick={() => onNavigate("home")} style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #10B981, #059669)", color: "white", fontSize: 16, fontWeight: 700, border: "none", boxShadow: "0 4px 12px rgba(16,185,129,0.3)", cursor: "pointer" }}>
            {t("common.goToDashboard")}
          </button>
        ) : (
          <>
            <button onClick={scan} disabled={!selected || scanning} style={{ width: "100%", height: 52, borderRadius: 14, background: selected && !scanning ? "linear-gradient(135deg, #FF6B35, #E05A2B)" : "#E5E7EB", color: selected && !scanning ? "white" : "#9CA3AF", fontSize: 16, fontWeight: 700, border: "none", cursor: selected ? "pointer" : "not-allowed" }}>
              {scanning ? t("biometricSetup.scanning") : t("biometricSetup.setUp")}
            </button>
            <button onClick={() => onNavigate("home")} style={{ width: "100%", height: 44, borderRadius: 12, background: "transparent", color: "#6B7280", fontSize: 14, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {t("biometricSetup.skipForNow")} <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
