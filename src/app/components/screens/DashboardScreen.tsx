import { ArrowLeft, TrendingUp, PiggyBank, Wallet, PlusCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { BottomNav } from "../BottomNav";
import { LoanCalculator } from "../LoanCalculator";
import { CreditScoreGauge } from "../CreditScoreGauge";
import { AnimatedStat } from "../AnimatedStat";
import { useAppContext } from "../../context/AppContext";
import { api, ApiError } from "../../api/client";
import { env } from "../../config/env";

interface Props { onNavigate: (s: string) => void; }

type Tab = "overview" | "loan" | "credit";

function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString(); }

export function DashboardScreen({ onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const { state } = useAppContext();
  const credit = state.credit;
  const loan = state.loan;
  const savingsBalance = state.savingsBalance;
  const { t } = useTranslation();

  // ── Top-up modal state ────────────────────────────────────────────────
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(50000);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [topUpSuccess, setTopUpSuccess] = useState(false);

  const handleTopUp = async () => {
    const token = state.session.token;
    if (!token || topUpLoading) return;
    setTopUpLoading(true);
    setTopUpError("");
    try {
      const res = await api.requestTopUp(token, {
        amount: topUpAmount,
        term_days: 91,
        purpose: "top-up",
        disbursement_method: "mtn_momo",
      });
      if (res.success) {
        setTopUpSuccess(true);
        setTimeout(() => { setTopUpOpen(false); setTopUpSuccess(false); }, 2000);
      } else {
        setTopUpError(res.reason ?? "Top-up unavailable");
      }
    } catch (e) {
      setTopUpError(e instanceof ApiError ? e.message : "Top-up failed. Try again.");
    } finally {
      setTopUpLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: t("dashboard.tabOverview") },
    { id: "loan", label: t("dashboard.tabLoanCalc") },
    { id: "credit", label: t("dashboard.tabCreditScore") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F1F5F9", paddingTop: 0 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={() => onNavigate("home")}
            style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>{t("dashboard.title")}</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, paddingBottom: 0 }}>
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              style={{
                flex: 1, height: 36, borderRadius: "8px 8px 0 0",
                background: tab === tabItem.id ? "white" : "rgba(255,255,255,0.12)",
                border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                color: tab === tabItem.id ? "var(--brand-primary-dark)" : "rgba(255,255,255,0.8)",
                transition: "all 0.15s",
              }}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 90, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <>
            {/* Key stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                {
                  label: t("dashboard.availableCredit"),
                  icon: <Wallet size={15} color="var(--brand-primary)" />,
                  bg: "var(--brand-light)",
                  value: <AnimatedStat value={(loan?.availableCredit ?? 0) / 1000} prefix="UGX " suffix="K" decimals={0} style={{ fontSize: 17, fontWeight: 800, color: "var(--brand-primary-dark)" }} />,
                  sub: loan?.creditIncreaseFromLastMonth
                    ? <span style={{ fontSize: 9, color: "#12B984", fontWeight: 600 }}>+{(loan.creditIncreaseFromLastMonth / 1000).toFixed(0)}K ↑</span>
                    : null,
                },
                {
                  label: t("dashboard.savings"),
                  icon: <PiggyBank size={15} color="#12B984" />,
                  bg: "#F0FDF4",
                  value: <AnimatedStat value={savingsBalance / 1000} prefix="UGX " suffix="K" decimals={0} style={{ fontSize: 17, fontWeight: 800, color: "#065F46" }} />,
                  sub: null,
                },
                {
                  label: t("dashboard.creditScore"),
                  icon: <TrendingUp size={15} color="#F59E0B" />,
                  bg: "#FFFBEB",
                  value: <AnimatedStat value={credit?.score ?? 0} style={{ fontSize: 17, fontWeight: 800, color: "#1F2937" }} />,
                  sub: <span style={{ fontSize: 9, color: "#12B984", fontWeight: 600 }}>{credit?.tier ?? "—"}</span>,
                },
              ].map(({ label, icon, bg, value, sub }) => (
                <div key={label} style={{ background: "white", borderRadius: 14, padding: "12px 10px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px" }}>
                    {icon}
                  </div>
                  {value}
                  <p style={{ fontSize: 9, color: "#9CA3AF", margin: "2px 0 2px" }}>{label}</p>
                  {sub}
                </div>
              ))}
            </div>

            {/* Active loan */}
            {loan?.activeLoan && (
              <div
                onClick={() => onNavigate("loan-detail")}
                style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>{t("dashboard.activeLoan")}</p>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#12B984", background: "#F0FDF4", padding: "2px 10px", borderRadius: 20, border: "1px solid #A7F3D0" }}>
                    {loan.activeLoan.status}
                  </span>
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#1F2937", margin: "0 0 10px" }}>
                  UGX {loan.activeLoan.amount.toLocaleString("en-UG")}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{t("dashboard.repaid")}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#12B984" }}>{loan.activeLoan.repaidPercent}%</span>
                </div>
                <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${loan.activeLoan.repaidPercent}%`, height: "100%", background: "linear-gradient(90deg, #12B984, #34D399)", borderRadius: 4, transition: "width 1s ease" }} />
                </div>
                {/* Request More — one-tap top-up */}
                {env.USE_API && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setTopUpOpen(true); setTopUpError(""); setTopUpAmount(50000); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      width: "100%", height: 40, borderRadius: 10, marginTop: 12,
                      background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", color: "white",
                      fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                      boxShadow: "0 3px 10px rgba(11,107,58,0.3)",
                    }}
                  >
                    <PlusCircle size={16} />
                    {t("dashboard.requestMore")}
                  </button>
                )}
              </div>
            )}

            {/* No active loan */}
            {!loan?.activeLoan && (
              <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>{t("dashboard.noActiveLoan")}</p>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{t("dashboard.noActiveLoanSub")}</p>
              </div>
            )}

            {/* Next payment */}
            {loan?.nextPayment && (
              <div style={{ background: "white", borderRadius: 16, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{t("dashboard.nextPayment")}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#1F2937", margin: "2px 0 0" }}>
                    UGX {loan.nextPayment.amount.toLocaleString("en-UG")}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{t("dashboard.due")}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", margin: "2px 0 0" }}>{loan.nextPayment.dueDate}</p>
                  <p style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600, margin: "1px 0 0" }}>{t("common.daysLeft", { count: loan.nextPayment.daysLeft })}</p>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: t("dashboard.applyLoan"), screen: "loan-calculator", color: "var(--brand-primary)", bg: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", border: "none" },
                { label: t("dashboard.makePayment"), screen: "make-payment", color: "white", bg: "linear-gradient(135deg, #12B984, #059669)", border: "none" },
                { label: t("dashboard.viewSavings"), screen: "goals", color: "var(--brand-primary)", bg: "white", border: "1.5px solid var(--brand-border)" },
                { label: t("dashboard.creditReport"), screen: "credit-dashboard", color: "var(--brand-primary)", bg: "white", border: "1.5px solid var(--brand-border)" },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => a.screen === "loan-calculator" ? setTab("loan") : onNavigate(a.screen)}
                  style={{
                    height: 52, borderRadius: 14,
                    background: a.bg, color: a.color,
                    fontSize: 13, fontWeight: 700,
                    border: a.border || "none",
                    cursor: "pointer",
                    boxShadow: a.bg.includes("gradient") ? "0 4px 12px rgba(0,0,0,0.15)" : "0 2px 6px rgba(0,0,0,0.05)",
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Loan Calculator tab ── */}
        {tab === "loan" && (
          <LoanCalculator
            onApply={(amount, termDays, purpose) => {
              onNavigate("loan-apply");
            }}
            maxAmount={loan?.availableCredit ?? 0}
          />
        )}

        {/* ── Credit Score tab ── */}
        {tab === "credit" && (
          <>
            <div style={{ background: "white", borderRadius: 20, padding: "24px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <CreditScoreGauge score={credit?.score ?? 0} size={220} />
              <p style={{ fontSize: 12, color: "#6B7280", marginTop: 8, textAlign: "center" }}>
                {credit?.tier
                  ? t("dashboard.creditTierMsg", { tier: credit.tier, max: credit?.maxScore ?? 850 })
                  : t("dashboard.creditNotComputed")}
              </p>
            </div>

            <button
              onClick={() => onNavigate("improve-credit")}
              style={{ width: "100%", height: 50, borderRadius: 14, background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(11,107,58,0.3)" }}
            >
              {t("dashboard.improveScore")}
            </button>
          </>
        )}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />

      {/* ── Top-up bottom sheet ──────────────────────────────────────────── */}
      {topUpOpen && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }}
          onClick={() => setTopUpOpen(false)}
        >
          <div
            style={{ width: "100%", background: "white", borderRadius: "20px 20px 0 0", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#1F2937", margin: 0 }}>{t("dashboard.requestMoreTitle")}</p>
              <button onClick={() => setTopUpOpen(false)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                <X size={20} color="#9CA3AF" />
              </button>
            </div>

            {topUpSuccess ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ fontSize: 40, margin: "0 0 8px" }}>✅</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#12B984", margin: 0 }}>{t("dashboard.fundsOnWay")}</p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{t("dashboard.fundsWillArrive", { amount: ugx(topUpAmount) })}</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                  {t("dashboard.requestMoreDesc")}
                </p>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                    {t("dashboard.amount")}
                  </label>
                  <input
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => { setTopUpAmount(Number(e.target.value)); setTopUpError(""); }}
                    min={20000}
                    step={10000}
                    style={{ width: "100%", height: 50, borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "0 16px", fontSize: 18, fontWeight: 800, color: "var(--brand-primary)", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                {/* Quick amount chips */}
                <div style={{ display: "flex", gap: 8 }}>
                  {[50000, 100000, 200000, 500000].map((a) => (
                    <button
                      key={a}
                      onClick={() => { setTopUpAmount(a); setTopUpError(""); }}
                      style={{
                        flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
                        fontSize: 11, fontWeight: 600, textAlign: "center",
                        background: topUpAmount === a ? "var(--brand-primary)" : "#F3F4F6",
                        color: topUpAmount === a ? "white" : "#374151",
                      }}
                    >
                      {(a / 1000)}K
                    </button>
                  ))}
                </div>

                {topUpError && <p style={{ fontSize: 12, color: "#EF4444", margin: "0" }}>{topUpError}</p>}

                <button
                  onClick={handleTopUp}
                  disabled={topUpLoading || topUpAmount < 20000}
                  style={{
                    width: "100%", height: 50, borderRadius: 14,
                    background: (topUpLoading || topUpAmount < 20000) ? "#F5B89A" : "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
                    color: "white", fontSize: 15, fontWeight: 700, border: "none",
                    cursor: (topUpLoading || topUpAmount < 20000) ? "wait" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {topUpLoading ? t("common.processing") : `Get ${ugx(topUpAmount)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}