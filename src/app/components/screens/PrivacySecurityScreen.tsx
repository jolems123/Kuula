import { ArrowLeft, Eye, EyeOff, Fingerprint, Shield, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function PrivacySecurityScreen({ onNavigate }: Props) {
  const [biometric, setBiometric] = useState(true);
  const { t } = useTranslation();
  const [twoFA, setTwoFA] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [pin, setPin] = useState(["", "", "", ""]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Privacy & Security</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* PIN Change */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: showChange ? 16 : 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F3FAF7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={18} color="#0B5E3A" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>Change PIN</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>4-digit app PIN</p>
            </div>
            <button onClick={() => setShowChange(!showChange)} style={{ padding: "6px 12px", borderRadius: 8, background: "#F3FAF7", border: "none", color: "#0B5E3A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {showChange ? "Cancel" : "Change"}
            </button>
          </div>
          {showChange && (
            <div>
              <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>Enter new 4-digit PIN</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                {pin.map((d, i) => (
                  <input key={i} type="password" maxLength={1} value={d}
                    onChange={(e) => { const next = [...pin]; next[i] = e.target.value; setPin(next); }}
                    style={{ width: 50, height: 56, borderRadius: 12, border: d ? "2px solid #0B5E3A" : "2px solid #E5E7EB", textAlign: "center", fontSize: 22, fontWeight: 800, color: "#1F2937", background: "#F9FAFB", outline: "none" }} />
                ))}
              </div>
              <button style={{ width: "100%", height: 44, marginTop: 14, borderRadius: 10, background: "linear-gradient(135deg, #0B5E3A, #064A2E)", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
                Set New PIN
              </button>
            </div>
          )}
        </div>

        {/* Toggles */}
        {[
          { icon: Fingerprint, label: "Biometric Login", sub: "Use fingerprint or Face ID", color: "#178654", key: "biometric", val: biometric, set: setBiometric },
          { icon: Shield, label: "Two-Factor Authentication", sub: "Extra OTP on each login", color: "#8B5CF6", key: "twoFA", val: twoFA, set: setTwoFA },
        ].map(({ icon: Icon, label, sub, color, key, val, set }) => (
          <div key={key} style={{ background: "white", borderRadius: 16, padding: "14px 16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={18} color={color} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{sub}</p>
            </div>
            <button onClick={() => set(!val)} style={{ width: 46, height: 26, borderRadius: 13, background: val ? color : "#D1D5DB", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: val ? "flex-end" : "flex-start", padding: 3 }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "white" }} />
            </button>
          </div>
        ))}

        {/* Data privacy */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 12 }}>Data & Privacy</p>
          {[
            { label: "View Privacy Policy", action: "View →", target: "customer-privacy-policy" },
            { label: "Terms of Service", action: "View →", target: "customer-terms" },
            { label: "Download My Data", action: "Request →", target: null },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? "1px solid #F3F4F6" : "none" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{item.label}</span>
              <span onClick={() => item.target && onNavigate(item.target)} style={{ fontSize: 12, color: "#0B5E3A", fontWeight: 700, cursor: "pointer" }}>{item.action}</span>
            </div>
          ))}
        </div>

        {/* Delete account */}
        <button onClick={() => onNavigate("delete-account")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 14, background: "#FEF2F2", border: "1px solid #FECACA", cursor: "pointer" }}>
          <Trash2 size={18} color="#EF4444" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#EF4444" }}>Delete Account</span>
        </button>
      </div>
    </div>
  );
}
