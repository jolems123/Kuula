import { ArrowLeft, MessageCircle, Phone, Mail, Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function ContactSupportScreen({ onNavigate }: Props) {
  const [mode, setMode] = useState<"chat" | "call" | "email">("chat");
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <button onClick={() => onNavigate("help-support")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Contact Support</span>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "white", borderBottom: "1px solid #F3F4F6" }}>
        {[
          { id: "chat" as const, Icon: MessageCircle, label: "Live Chat" },
          { id: "call" as const, Icon: Phone, label: "Call" },
          { id: "email" as const, Icon: Mail, label: "Email" },
        ].map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setMode(id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10, border: "none", cursor: "pointer", background: mode === id ? "#FF6B35" : "#F3F4F6", color: mode === id ? "white" : "#6B7280", fontSize: 12, fontWeight: 600 }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        {mode === "chat" && (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ background: "#FFF0E8", borderRadius: "16px 16px 16px 4px", padding: "12px 14px", maxWidth: "80%", marginBottom: 10 }}>
                <p style={{ fontSize: 13, color: "#374151", margin: "0 0 2px", fontWeight: 600 }}>Kuula Support 🤖</p>
                <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>Hello Amara! How can I help you today? Please describe your issue and I'll assist you right away.</p>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>09:41 AM</span>
              </div>
              {sent && (
                <div style={{ background: "#FF6B35", borderRadius: "16px 16px 4px 16px", padding: "12px 14px", maxWidth: "80%", marginLeft: "auto", marginBottom: 10 }}>
                  <p style={{ fontSize: 13, color: "white", margin: 0 }}>{message}</p>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", display: "block", textAlign: "right" }}>09:42 AM ✓</span>
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Or choose a quick topic:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Loan application", "Payment issue", "Account access", "Credit score", "Other"].map((t) => (
                <button key={t} onClick={() => setMessage(t)} style={{ padding: "6px 12px", borderRadius: 20, background: "#FFF0E8", border: "none", color: "#FF6B35", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          </>
        )}

        {mode === "call" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: "#F0FDF4", border: "2px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={36} color="#10B981" strokeWidth={1.5} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>0800 123 456</p>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0" }}>Toll-free · Available 24/7</p>
              <p style={{ fontSize: 12, color: "#9CA3AF" }}>Average wait time: 2 minutes</p>
            </div>
            <button style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #10B981, #059669)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Phone size={18} /> Call Now
            </button>
          </div>
        )}

        {mode === "email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input placeholder="Subject" style={{ width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            <textarea placeholder="Describe your issue in detail..." rows={6} style={{ width: "100%", borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "10px 14px", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "none" }} />
            <p style={{ fontSize: 11, color: "#9CA3AF" }}>We'll reply to amara.nakato@gmail.com within 24 hours.</p>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {mode === "chat" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your message..." style={{ flex: 1, height: 46, borderRadius: 10, border: "1.5px solid #E5E7EB", padding: "0 14px", fontSize: 13, outline: "none" }} />
            <button onClick={() => { if (message) setSent(true); }} style={{ width: 46, height: 46, borderRadius: 10, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Send size={18} color="white" />
            </button>
          </div>
        ) : (
          <button style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(135deg, #FF6B35, #E05A2B)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>
            Send Message
          </button>
        )}
      </div>
    </div>
  );
}
