import { ArrowLeft, CheckCircle, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

export function NotificationDetailScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("notifications")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Notification</span>
        </div>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={16} color="white" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero */}
        <div style={{ background: "white", borderRadius: 20, padding: "24px", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: "#F0FDF4", border: "2px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle size={40} color="#12B984" strokeWidth={1.5} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1F2937", margin: 0 }}>Loan Approved! 🎉</h2>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>2 hours ago · June 11, 2026 at 09:41 AM</p>
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }}>
            Congratulations, <strong>Amara</strong>! 🎉<br /><br />
            Your loan application of <strong>UGX 500,000</strong> has been approved and successfully disbursed to your MTN MoMo account ending in <strong>3456</strong>.<br /><br />
            <strong>Loan Summary:</strong><br />
            • Amount: UGX 500,000<br />
            • Due Date: July 11, 2026<br />
            • Total Repayment: UGX 541,425<br />
            • Reference: KUL-2026-04821<br /><br />
            Please ensure funds are available on your repayment date to maintain your excellent credit score. Thank you for choosing Kuula!
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onNavigate("loan-detail")} style={{ flex: 1, height: 48, borderRadius: 12, background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>View Loan</button>
          <button onClick={() => onNavigate("notifications")} style={{ flex: 1, height: 48, borderRadius: 12, background: "#F3F4F6", color: "#374151", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>Back</button>
        </div>
      </div>
    </div>
  );
}
