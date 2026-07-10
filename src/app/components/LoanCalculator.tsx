import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localQuote } from "../lib/pricing";

interface Props {
  onApply?: (amount: number, termDays: number, purpose: string) => void;
  maxAmount?: number;
}

// Terms stay >= 90 days (Google) and pricing uses the shared APR-capped engine.
const TERM_DAYS = [90, 120, 180, 365];

function fmt(n: number) {
  return "UGX " + Math.round(n).toLocaleString("en-UG");
}

function LoanBreakdownRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0",
      borderTop: "1px solid #F3F4F6",
    }}>
      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: highlight ? 800 : 600, color: highlight ? "#E05A2B" : "#1F2937" }}>
        {value}
      </span>
    </div>
  );
}

export function LoanCalculator({ onApply, maxAmount = 2_000_000 }: Props) {
  const { t } = useTranslation();
  const MIN = 50_000;
  const MAX = maxAmount;

  const [amount, setAmount] = useState(500_000);
  const [termIdx, setTermIdx] = useState(0);
  const [purpose, setPurpose] = useState("Business");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const termDays = TERM_DAYS[termIdx];
  const termLabel = t(`loanApply.months${termDays === 90 ? "3" : termDays === 120 ? "4" : termDays === 180 ? "6" : "12"}`);
  const quote = localQuote(amount, termDays);
  const interest = quote.interest;
  const fee = quote.fee;
  const total = quote.total;
  const weekly = total / (termDays / 7);

  const sliderPct = ((amount - MIN) / (MAX - MIN)) * 100;

  const PURPOSES = [
    { key: "Business", label: t("loanApply.purposeBusiness") },
    { key: "School Fees", label: t("loanApply.purposeSchool") },
    { key: "Medical", label: t("loanApply.purposeMedical") },
    { key: "Farming", label: t("loanApply.purposeFarming") },
    { key: "Home Repair", label: t("loanApply.purposeHomeRepair") },
    { key: "Other", label: t("loanApply.purposeOther") },
  ];

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    setAmount(Math.round(raw / 10_000) * 10_000);
  }, []);

  return (
    <div
      style={{
        background: "white",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        border: "1px solid #E5E7EB",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #FF6B35, #E05A2B)",
          padding: "16px 20px",
        }}
      >
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0, fontWeight: 500 }}>
          {t("loanApply.loanAmount")}
        </p>
        <p style={{ fontSize: 32, fontWeight: 800, color: "white", margin: "4px 0 0", letterSpacing: -1 }}>
          {fmt(amount)}
        </p>
      </div>

      <div style={{ padding: "20px" }}>
        {/* Slider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(MIN)}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(MAX)}</span>
          </div>
          <div style={{ position: "relative", height: 40, display: "flex", alignItems: "center" }}>
            {/* Track fill */}
            <div style={{
              position: "absolute", left: 0, height: 6, borderRadius: 3,
              width: `${sliderPct}%`, background: "linear-gradient(90deg, #FF6B35, #F59E0B)",
              pointerEvents: "none", zIndex: 1,
            }} />
            {/* Track bg */}
            <div style={{
              position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3,
              background: "#E5E7EB",
            }} />
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={10_000}
              value={amount}
              onChange={handleSlider}
              style={{
                position: "absolute", width: "100%", opacity: 0, height: 40, cursor: "pointer", zIndex: 2,
              }}
            />
            {/* Thumb */}
            <div style={{
              position: "absolute",
              left: `clamp(0px, calc(${sliderPct}% - 14px), calc(100% - 28px))`,
              width: 28, height: 28, borderRadius: 14,
              background: "white",
              border: "3px solid #FF6B35",
              boxShadow: "0 2px 8px rgba(13,92,58,0.35)",
              zIndex: 1,
              pointerEvents: "none",
            }} />
          </div>

          {/* Quick picks */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[100_000, 250_000, 500_000, 1_000_000, 2_000_000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: `1.5px solid ${amount === v ? "#FF6B35" : "#E5E7EB"}`,
                  background: amount === v ? "#FFF0E8" : "white",
                  color: amount === v ? "#E05A2B" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}K`}
              </button>
            ))}
          </div>
        </div>

        {/* Term selector */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("loanApply.loanTerm")}</p>
          <div style={{ display: "flex", gap: 6 }}>
            {TERM_DAYS.map((days, i) => {
              const lbl = t(`loanApply.months${days === 90 ? "3" : days === 120 ? "4" : days === 180 ? "6" : "12"}`);
              return (
                <button
                  key={days}
                  onClick={() => setTermIdx(i)}
                  style={{
                    flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${termIdx === i ? "#FF6B35" : "#E5E7EB"}`,
                    background: termIdx === i ? "#FFF0E8" : "white",
                    color: termIdx === i ? "#E05A2B" : "#6B7280",
                    cursor: "pointer",
                  }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Purpose */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("loanApply.purpose")}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PURPOSES.map((p) => (
              <button
                key={p.key}
                onClick={() => setPurpose(p.key)}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: `1.5px solid ${purpose === p.key ? "#FF6B35" : "#E5E7EB"}`,
                  background: purpose === p.key ? "#FFF0E8" : "white",
                  color: purpose === p.key ? "#E05A2B" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            borderRadius: 14,
            background: "#FFF0E8",
            border: "1px solid #FFDCC8",
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>{t("loanApply.summary")}</p>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#E05A2B", fontSize: 12 }}
            >
              <Info size={13} />
              Details
              {showBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "#6B7280" }}>{t("loanApply.totalRepayable")}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#E05A2B", letterSpacing: -0.5 }}>
              {fmt(total)}
            </span>
          </div>

          {showBreakdown && (
            <div style={{ marginTop: 8 }}>
              <LoanBreakdownRow label={t("loanApply.principal")} value={fmt(amount)} />
              <LoanBreakdownRow label={t("loanApply.interest", { apr: quote.aprPercent })} value={fmt(interest)} />
              <LoanBreakdownRow label={t("loanApply.processingFee")} value="UGX 0" />
              <LoanBreakdownRow label={t("loanApply.weeklyPayment")} value={fmt(weekly)} />
              <LoanBreakdownRow label={t("loanApply.totalRepayable")} value={fmt(total)} highlight />
            </div>
          )}

          {!showBreakdown && (
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>
              ≈ {fmt(weekly)} / week · {termLabel}
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => onApply?.(amount, termDays, purpose)}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            background: "linear-gradient(135deg, #FF6B35, #E05A2B)",
            color: "white", fontSize: 16, fontWeight: 700, border: "none",
            boxShadow: "0 6px 20px rgba(13,92,58,0.35)",
            cursor: "pointer",
          }}
        >
          {t("loanApply.apply")} {fmt(amount)}
        </button>

        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 10 }}>
          {t("loanApply.fundsDisclaimer")}
        </p>
      </div>
    </div>
  );
}