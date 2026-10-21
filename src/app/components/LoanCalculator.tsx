import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localQuote } from "../lib/pricing";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurposes, type BusinessLoanPurposeOption } from "../lib/business-loan-purpose";
import { getLoanTermOptions } from "../lib/loan-terms";

interface Props {
  onApply?: (amount: number, termDays: number, purpose: string) => void;
  maxAmount?: number;
}

const TERM_DAYS = getLoanTermOptions();

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
      <span style={{ fontSize: 14, fontWeight: highlight ? 800 : 600, color: highlight ? "#064A2E" : "#1F2937" }}>
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
  const [purposes, setPurposes] = useState<BusinessLoanPurposeOption[]>(["Working capital"]);
  const [otherPurpose, setOtherPurpose] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const termDays = TERM_DAYS[termIdx];
  const termLabel = `${termDays} ${t("loanApply.days")}`;
  const quote = localQuote(amount, termDays);
  const interest = quote.interest;
  const fee = quote.fee;
  const total = quote.total;
  const weekly = total / (termDays / 7);

  const sliderPct = ((amount - MIN) / (MAX - MIN)) * 100;

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
          background: "linear-gradient(135deg, #0B5E3A, #064A2E)",
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
              width: `${sliderPct}%`, background: "linear-gradient(90deg, #0B5E3A, #F59E0B)",
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
              border: "3px solid #0B5E3A",
              boxShadow: "0 2px 8px rgba(11,94,58,0.35)",
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
                  border: `1.5px solid ${amount === v ? "#0B5E3A" : "#E5E7EB"}`,
                  background: amount === v ? "#F3FAF7" : "white",
                  color: amount === v ? "#064A2E" : "#6B7280",
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {TERM_DAYS.map((days, i) => {
              const lbl = `${days} ${t("loanApply.days")}`;
              return (
                <button
                  key={days}
                  onClick={() => setTermIdx(i)}
                  style={{
                    minWidth: 0, padding: "8px 3px", borderRadius: 10, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                    border: `1.5px solid ${termIdx === i ? "#0B5E3A" : "#E5E7EB"}`,
                    background: termIdx === i ? "#F3FAF7" : "white",
                    color: termIdx === i ? "#064A2E" : "#6B7280",
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
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Business loan purposes — select all that apply</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BUSINESS_LOAN_PURPOSES.map((option) => (
              <button
                key={option}
                className="kuula-purpose-choice"
                aria-label={option === "Other" ? "Other business purpose" : option}
                type="button"
                aria-pressed={purposes.includes(option)}
                onClick={() => setPurposes(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option])}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: `1.5px solid ${purposes.includes(option) ? "#0B5E3A" : "#E5E7EB"}`,
                  background: purposes.includes(option) ? "#F3FAF7" : "white",
                  color: purposes.includes(option) ? "#064A2E" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                {purposes.includes(option) ? "✓ " : ""}{option === "Other" ? "Other business purpose" : option}
              </button>
            ))}
          </div>
          {purposes.includes("Other") && <textarea aria-label="Describe your business use" value={otherPurpose} maxLength={100} onChange={(event) => setOtherPurpose(event.target.value)} placeholder="Describe your business use" rows={2} style={{ boxSizing: "border-box", width: "100%", marginTop: 10, border: "1px solid #D8E2DC", borderRadius: 10, padding: 10, resize: "vertical" }} />}
        </div>

        {/* Summary */}
        <div
          style={{
            borderRadius: 14,
            background: "#F3FAF7",
            border: "1px solid #DFF2E9",
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>{t("loanApply.summary")}</p>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#064A2E", fontSize: 12 }}
            >
              <Info size={13} />
              Details
              {showBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "#6B7280" }}>{t("loanApply.totalRepayable")}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#064A2E", letterSpacing: -0.5 }}>
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
          disabled={!purposes.length || (purposes.includes("Other") && !otherPurpose.trim())}
          onClick={() => onApply?.(amount, termDays, formatBusinessLoanPurposes(purposes, otherPurpose))}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            background: "linear-gradient(135deg, #0B5E3A, #064A2E)",
            color: "white", fontSize: 16, fontWeight: 700, border: "none",
            boxShadow: "0 6px 20px rgba(11,94,58,0.35)",
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
