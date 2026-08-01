import { ArrowLeft, ShieldAlert, Bell } from "lucide-react";

interface Props { onNavigate: (screen: string) => void; }

export function AddMoneyScreen({ onNavigate }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #065F46, #12B984)" }}>
        <button
          onClick={() => onNavigate("goals")}
          aria-label="Back to goals"
          style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>
          Add Money to Savings
        </span>
      </div>

      <div style={{ flex: 1, padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #FED7AA", marginBottom: 20 }}>
          <ShieldAlert size={42} color="#D97706" strokeWidth={1.7} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>
          Savings deposits are not live yet
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#6B7280", maxWidth: 360, margin: "12px 0 0" }}>
          Kuula will not increase your savings balance until your mobile-money payment is collected, safeguarded, and confirmed through an audited settlement process.
        </p>

        <div style={{ width: "100%", maxWidth: 380, background: "white", borderRadius: 16, border: "1px solid #E5E7EB", padding: 16, marginTop: 24, textAlign: "left" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>What is being completed</p>
          <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.7, color: "#6B7280" }}>
            Mobile-money collection, regulated custody, reconciliation, withdrawal settlement, interest calculation, and customer statements.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, color: "#065F46" }}>
          <Bell size={15} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>The app will show this feature only after real-money testing is complete.</span>
        </div>
      </div>

      <div style={{ padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={() => onNavigate("goals")}
          style={{ width: "100%", height: 52, borderRadius: 14, background: "#065F46", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          Return to Savings Goals
        </button>
      </div>
    </div>
  );
}
