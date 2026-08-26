import { ArrowLeft, MessageCircle, Mail, ShieldAlert, FileText } from "lucide-react";

interface Props { onNavigate: (s: string) => void; }

const SUPPORT_EMAIL = "support@kuulapp.com";
const COMPLAINTS_EMAIL = "complaints@kuulapp.com";
const PRIVACY_EMAIL = "privacy@kuulapp.com";

function mailto(address: string, subject: string) {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}

export function ContactSupportScreen({ onNavigate }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #F4612B, #D9531F)" }}>
        <button onClick={() => onNavigate("help-support")} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Contact Kuula</span>
      </div>

      <main style={{ flex: 1, overflowY: "auto", padding: "20px 16px 100px" }}>
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#7C2D12" }}>
            For your security, never send your PIN, OTP, password, full card details, or mobile-money PIN to Kuula support.
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <button onClick={() => onNavigate("user-support-chat")} style={{ width: "100%", textAlign: "left", background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: "#FFF6EF", display: "grid", placeItems: "center" }}><MessageCircle size={20} color="#F4612B" /></span>
            <div><strong style={{ display: "block", fontSize: 14, color: "#1F2937" }}>In-app support</strong><span style={{ fontSize: 11.5, color: "#6B7280" }}>Send a message through Kuula's authenticated support channel.</span></div>
          </button>

          <a href={mailto(SUPPORT_EMAIL, "Kuula customer support request")} style={{ textDecoration: "none", background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: "#EFF6FF", display: "grid", placeItems: "center" }}><Mail size={20} color="#2563EB" /></span>
            <div><strong style={{ display: "block", fontSize: 14, color: "#1F2937" }}>Customer support</strong><span style={{ fontSize: 11.5, color: "#6B7280" }}>{SUPPORT_EMAIL}</span></div>
          </a>

          <a href={mailto(COMPLAINTS_EMAIL, "Formal complaint to Kuula")} style={{ textDecoration: "none", background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: "#FEF2F2", display: "grid", placeItems: "center" }}><ShieldAlert size={20} color="#DC2626" /></span>
            <div><strong style={{ display: "block", fontSize: 14, color: "#1F2937" }}>Complaints</strong><span style={{ fontSize: 11.5, color: "#6B7280" }}>{COMPLAINTS_EMAIL}</span></div>
          </a>

          <a href={mailto(PRIVACY_EMAIL, "Kuula privacy request")} style={{ textDecoration: "none", background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: "#F0FDF4", display: "grid", placeItems: "center" }}><FileText size={20} color="#16A34A" /></span>
            <div><strong style={{ display: "block", fontSize: 14, color: "#1F2937" }}>Privacy & data requests</strong><span style={{ fontSize: 11.5, color: "#6B7280" }}>{PRIVACY_EMAIL}</span></div>
          </a>
        </div>

        <p style={{ marginTop: 18, fontSize: 11, lineHeight: 1.5, color: "#9CA3AF" }}>
          Kuula does not currently publish a customer telephone number in the app. A phone contact should only be added after the official support line is activated and verified.
        </p>
      </main>
    </div>
  );
}
