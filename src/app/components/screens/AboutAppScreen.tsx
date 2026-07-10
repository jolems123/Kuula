import { ArrowLeft, ExternalLink, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import kuulaLogo from "../../../imports/kuula-tile-1024.png";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { api, type Compliance } from "../../api/client";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const FALLBACK_COMPLIANCE: Compliance = {
  maxAprPercent: 33.6, appleAprCapPercent: 36, minTermDays: 90, googleMinTermDays: 61,
  savingsAprPercent: 5, savingsDiscountPercent: 5, savingsThreshold: 100000,
  compound: false, dataRetentionYears: 10,
};

export function AboutAppScreen({ onNavigate }: Props) {
  const [c, setC] = useState<Compliance>(FALLBACK_COMPLIANCE);
  const { t } = useTranslation();
  useEffect(() => { api.compliance().then(setC).catch(() => {}); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <button onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>About Kuula</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px 30px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        {/* Logo */}
        <div style={{ width: 80, height: 80, borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 16px rgba(16,185,129,0.25)" }}>
          <ImageWithFallback src={kuulaLogo} alt="Kuula logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#1F2937", margin: 0, letterSpacing: -1 }}>Kuula</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0" }}>Version 2.4.1 (Build 241)</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 }}>
            <Shield size={14} color="#10B981" />
            <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>UMRA Licensed · BOU Regulated</span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 1.7, maxWidth: 300 }}>
          Kuula is Uganda's trusted mobile lending platform, providing fast, secure loans and savings services via MTN MoMo and Airtel Money.
        </p>

        {/* Transparent, compliant lending facts */}
        <div style={{ width: "100%", background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#1F2937", margin: "0 0 10px" }}>Transparent Lending</p>
          {[
            ["Maximum APR (all-in)", `${c.maxAprPercent}% / year`],
            ["Interest type", c.compound ? "Compound" : "Simple — never compounded"],
            ["Minimum loan term", `${c.minTermDays} days`],
            ["Savings interest", `${c.savingsAprPercent}% / year`],
            ["Save ≥ UGX 100k", `−${c.savingsDiscountPercent}% loan APR`],
            ["Record retention", `${c.dataRetentionYears} years (UMRA)`],
          ].map(([l, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 5 ? "1px solid #F3F4F6" : "none" }}>
              <span style={{ fontSize: 12.5, color: "#6B7280" }}>{l}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ width: "100%", background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          {[
            { label: "Terms of Service", icon: "📄", screen: "customer-terms" },
            { label: "Privacy Policy", icon: "🔒", screen: "customer-privacy-policy" },
            { label: "Cookie Policy", icon: "🍪", screen: null },
            { label: "Open Source Licenses", icon: "💻", screen: null },
            { label: "Visit kuula.ug", icon: "🌐", screen: null },
          ].map((item, i) => (
            <button key={i} onClick={() => item.screen && onNavigate(item.screen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", borderBottom: i < 4 ? "1px solid #F3F4F6" : "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 14, color: "#374151", flex: 1 }}>{item.label}</span>
              <ExternalLink size={14} color="#D1D5DB" />
            </button>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>© 2026 Kuula Microfinance Ltd.</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Kampala, Uganda · support@kuula.ug</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>0800 123 456 (toll-free)</p>
        </div>
      </div>
    </div>
  );
}
