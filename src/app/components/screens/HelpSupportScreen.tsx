import { ArrowLeft, MessageCircle, Phone, Mail, ChevronRight, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const FAQS = [
  { q: "How do I apply for a loan?", a: "Tap 'Apply for Loan' on your Home screen. Choose your amount, term, and purpose, then submit." },
  { q: "How long does approval take?", a: "Most applications are decided in 2–5 minutes. We'll notify you via SMS and app notification." },
  { q: "What is the interest rate?", a: "Kuula charges simple interest at an all-inclusive APR of up to 33.6% per year — the maximum allowed under Uganda's UMRA regulations. No compounding, no hidden fees." },
  { q: "How do I repay my loan?", a: "Pay via MTN MoMo, Airtel Money, or bank transfer. Tap 'Make Payment' on your loan screen." },
  { q: "Can I repay early?", a: "Yes! Kuula charges no early repayment penalty. Paying early saves you on interest." },
];

import { useState } from "react";

export function HelpSupportScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}>
        <button onClick={() => onNavigate("settings")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>{t("support.title")}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Contact options */}
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("support.contactUs")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { Icon: MessageCircle, label: t("support.liveChat"), sub: t("support.avgResponse"), color: "#0B5E3A", bg: "#F3FAF7", screen: "contact-support" },
            { Icon: Phone, label: t("support.callUs"), sub: "0800 123 456 (Free)", color: "#178654", bg: "#F0FDF4", screen: "contact-support" },
            { Icon: Mail, label: t("support.emailUs"), sub: "support@kuulapp.com", color: "#F59E0B", bg: "#FFF7ED", screen: "contact-support" },
            { Icon: BookOpen, label: t("support.userGuide"), sub: t("support.howToArticles"), color: "#8B5CF6", bg: "#F5F3FF", screen: "about-app" },
          ].map(({ Icon, label, sub, color, bg, screen }) => (
            <button key={label} onClick={() => onNavigate(screen)} style={{ background: "white", borderRadius: 14, padding: "16px 12px", border: "1px solid #F3F4F6", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={20} color={color} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>{label}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>{sub}</p>
              </div>
            </button>
          ))}
        </div>

        {/* FAQ */}
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("support.faq")}</p>
        <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", flex: 1 }}>{faq.q}</span>
                <ChevronRight size={14} color="#D1D5DB" style={{ transform: open === i ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {open === i && (
                <div style={{ padding: "0 16px 14px" }}>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F3FAF7", border: "1px solid #DFF2E9" }}>
          <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>{t("support.emergency")}</p>
        </div>
      </div>
    </div>
  );
}
