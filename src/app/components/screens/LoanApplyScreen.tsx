import { ArrowLeft, ChevronDown, Smartphone, CreditCard } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { localQuote } from "../../lib/pricing";

interface Props {
  onNavigate: (screen: string) => void;
}

function formatUGX(n: number) {
  return "UGX " + Math.round(n).toLocaleString("en-UG");
}

const METHODS = [
  { id: "mtn", label: "MTN MoMo", icon: "📱", color: "#FCD34D" },
  { id: "airtel", label: "Airtel Money", icon: "📱", color: "#EF4444" },
  { id: "bank", label: "Bank Account", icon: "🏦", color: "#6B7280" },
];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();

  // Terms stay >= 90 days to satisfy Google Play's ban on full repayment in <= 60 days.
  const TERMS = [90, 120, 180];
  const PURPOSES = [
    { key: "Business", label: t("loanPurpose.business") },
    { key: "School Fees", label: t("loanPurpose.schoolFees") },
    { key: "Medical", label: t("loanPurpose.medical") },
    { key: "Farming", label: t("loanPurpose.farming") },
    { key: "Home Repair", label: t("loanPurpose.homeRepair") },
    { key: "Other", label: t("loanPurpose.other") },
  ];
  const [amount, setAmount] = useState(500000);
  const [term, setTerm] = useState(90);
  const [purpose, setPurpose] = useState("Business");
  const [method, setMethod] = useState("mtn");
  const [loading, setLoading] = useState(false);

  const MIN = 50000;
  const MAX = 2000000;
  // APR-capped, simple-interest pricing (mirrors the backend).
  const quote = localQuote(amount, term, state.savingsBalance);
  const fee = quote.fee;
  const interest = quote.interest;
  const total = quote.total;

  const handleApply = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onNavigate("loan-review");
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div
        className="flex items-center px-4 pt-4 pb-4"
        style={{ background: "linear-gradient(135deg, #F4612B, #D9531F)" }}
      >
        <button
          onClick={() => onNavigate("home")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.2)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>
          {t("loanApply.title")}
        </span>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 120 }}>
        {/* Amount input */}
        <div
          className="p-5 rounded-2xl"
          style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>
            {t("loanApply.loanAmount").toUpperCase()}
          </label>
          <div className="flex items-baseline gap-2 mt-2">
            <span style={{ fontSize: 15, fontWeight: 700, color: "#6B7280" }}>UGX</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= MIN && v <= MAX) setAmount(v);
              }}
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: "#F4612B",
                border: "none",
                outline: "none",
                background: "transparent",
                width: "100%",
                letterSpacing: -1,
              }}
            />
          </div>
          <div className="mt-4">
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={50000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#F4612B" }}
            />
            <div className="flex justify-between mt-1">
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>UGX 50,000</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>UGX 2,000,000</span>
            </div>
          </div>
        </div>

        {/* Term selector */}
        <div
          className="p-4 rounded-2xl"
          style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>
            {t("loanApply.repaymentTerm").toUpperCase()}
          </label>
          <div className="flex gap-2 flex-wrap mt-3">
            {TERMS.map((d) => (
              <button
                key={d}
                onClick={() => setTerm(d)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: term === d ? "none" : "1.5px solid #E5E7EB",
                  background: term === d ? "#F4612B" : "white",
                  color: term === d ? "white" : "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {d} {t("loanApply.days")}
              </button>
            ))}
          </div>
        </div>

        {/* Purpose */}
        <div
          className="p-4 rounded-2xl"
          style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>
            {t("loanApply.loanPurpose").toUpperCase()}
          </label>
          <div className="flex gap-2 flex-wrap mt-3">
            {PURPOSES.map((p) => (
              <button
                key={p.key}
                onClick={() => setPurpose(p.key)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 20,
                  border: purpose === p.key ? "none" : "1.5px solid #E5E7EB",
                  background: purpose === p.key ? "#FFF6EF" : "white",
                  color: purpose === p.key ? "#F4612B" : "#6B7280",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Disbursement method */}
        <div
          className="p-4 rounded-2xl"
          style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", letterSpacing: 0.5 }}>
            {t("loanApply.disbursementMethod").toUpperCase()}
          </label>
          <div className="flex flex-col gap-2 mt-3">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: method === m.id ? "#FFF6EF" : "#F9FAFB",
                  border: method === m.id ? "1.5px solid #FFDCC8" : "1.5px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", flex: 1 }}>
                  {m.label}
                </span>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    border: method === m.id ? "none" : "2px solid #D1D5DB",
                    background: method === m.id ? "#F4612B" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {method === m.id && <div style={{ width: 8, height: 8, borderRadius: 4, background: "white" }} />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Repayment Summary */}
        <div
          className="p-4 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #FFF6EF, #FFDCC8)",
            border: "1px solid #FFDCC8",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
            {t("loanApply.totalRepaymentSummary")}
          </p>
          {[
            { label: t("loanApply.loanAmount"), value: formatUGX(amount) },
            { label: t("loanApply.interest", { apr: quote.aprPercent }), value: formatUGX(interest) },
            { label: t("loanApply.serviceFee"), value: "UGX 0" },
          ].map((row) => (
            <div key={row.label} className="flex justify-between py-1.5" style={{ borderBottom: "1px solid rgba(255,107,53,0.1)" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{row.value}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3 mt-1">
            <span style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{t("loanApply.totalRepayment")}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#D9531F" }}>{formatUGX(total)}</span>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3"
        style={{ background: "white", borderTop: "1px solid #F3F4F6" }}
      >
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginBottom: 10 }}>
          {t("loanApply.disclaimer")}
        </p>
        <button
          onClick={handleApply}
          disabled={loading}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            background: loading ? "#F5B89A" : "linear-gradient(135deg, #F4612B, #D9531F)",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            boxShadow: "0 4px 16px rgba(255,107,53,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {loading ? (
            <>
              <div
                style={{
                  width: 20,
                  height: 20,
                  border: "2.5px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              {t("common.processing")}
            </>
          ) : (
            t("loanApply.applyNow")
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
