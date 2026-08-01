import { ArrowLeft, ShieldAlert, WalletCards } from "lucide-react";

interface Props { onNavigate: (screen: string) => void; }

export function WithdrawSavingsScreen({ onNavigate }: Props) {
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
          Withdraw Savings
        </span>
      </div>

      <div style={{ flex: 1, padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ width: 88, height: 88, borderRadius: 44, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #FECACA", marginBottom: 20 }}>
          <ShieldAlert size={42} color="#DC2626" strokeWidth={1.7} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: 0 }}>
          Savings withdrawals are unavailable
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#6B7280", maxWidth: 360, margin: "12px 0 0" }}>
          Kuula will not reduce a balance or show a withdrawal as completed unless money is actually sent to your verified mobile-money account and confirmed by the payment provider.
        </p>

        <div style={{ width: "100%", maxWidth: 380, background: "white", borderRadius: 16, border: "1px solid #E5E7EB", padding: 16, marginTop: 24, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <WalletCards size={18} color="#065F46" />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>No hardcoded or simulated balance is shown</p>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.7, color: "#6B7280" }}>
            Existing development balances are excluded from customer funds, loan pricing, credit scoring, and financial reports until they can be reconciled to real deposits.
          </p>
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
