import { useState, useRef } from "react";
import { Shield, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function AdminOTPScreen({ onNavigate }: Props) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const { t } = useTranslation();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handle = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val; setOtp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const filled = otp.every((d) => d !== "");

  return (
    <div style={{ position: "relative", minHeight: "100%", background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button onClick={() => onNavigate("admin-login")} aria-label="Go back" title="Go back" style={{ position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <ArrowLeft size={18} color="white" />
      </button>
      <div style={{ width: "100%", maxWidth: 400, background: "white", borderRadius: 20, padding: 36, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: "#FFF0E8", border: "2px solid #B6DCC8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Shield size={36} color="#FF6B35" strokeWidth={1.5} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Two-Factor Verification</h2>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 8, lineHeight: 1.6 }}>Enter the 6-digit code sent to<br /><strong style={{ color: "#1F2937" }}>admin@kuula.ug</strong></p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {otp.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={(e) => handle(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
              style={{ width: 48, height: 58, borderRadius: 12, textAlign: "center", fontSize: 24, fontWeight: 800, color: "#1F2937", background: d ? "#FFF0E8" : "#F9FAFB", border: `2px solid ${d ? "#FF6B35" : "#E5E7EB"}`, outline: "none" }} />
          ))}
        </div>
        <button onClick={() => { if (filled) onNavigate("admin-dashboard"); }} style={{ width: "100%", height: 50, borderRadius: 12, background: filled ? "linear-gradient(135deg, #FF6B35, #E05A2B)" : "#E5E7EB", color: filled ? "white" : "#9CA3AF", fontSize: 15, fontWeight: 700, border: "none", cursor: filled ? "pointer" : "not-allowed" }}>
          Verify & Continue
        </button>
        <button style={{ fontSize: 13, color: "#FF6B35", border: "none", background: "none", cursor: "pointer", fontWeight: 600 }}>Resend Code</button>
      </div>
    </div>
  );
}
