import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const METHODS = [
  { logo: "🟡", name: "MTN MoMo", number: "+256 770 123 456", default: true, color: "#F59E0B" },
  { logo: "🔴", name: "Airtel Money", number: "+256 752 987 654", default: false, color: "#EF4444" },
  { logo: "🏦", name: "Stanbic Bank", number: "Acc: ****4532", default: false, color: "#0D5C3A" },
];

export function PaymentMethodsListScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("wallet")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Payment Methods</span>
        </div>
        <button onClick={() => onNavigate("add-payment-method")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}>
          <Plus size={14} /> Add New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, color: "#6B7280" }}>Manage your linked payment accounts used for loan disbursement and repayment.</p>

        {METHODS.map((m, i) => (
          <div key={i} style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: m.default ? "2px solid #0D5C3A" : "1px solid #F3F4F6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 32 }}>{m.logo}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{m.name}</span>
                  {m.default && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#0D5C3A", background: "#ECF5F0", padding: "2px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                      <Star size={9} fill="#0D5C3A" /> Default
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>{m.number}</p>
              </div>
              <button style={{ width: 34, height: 34, borderRadius: 8, background: "#FEF2F2", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={15} color="#EF4444" />
              </button>
            </div>
            {!m.default && (
              <button style={{ marginTop: 12, width: "100%", height: 36, borderRadius: 10, background: "#F3F4F6", border: "none", color: "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Set as Default
              </button>
            )}
          </div>
        ))}

        <button onClick={() => onNavigate("add-payment-method")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", borderRadius: 16, border: "2px dashed #D1D5DB", background: "white", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={16} /> Add New Payment Method
        </button>
      </div>
    </div>
  );
}
