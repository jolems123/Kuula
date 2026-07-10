import { Bell, TrendingUp, Calendar, ArrowUpRight, PiggyBank, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";

interface Props {
  onNavigate: (screen: string) => void;
}

interface TransactionRow {
  id?: string;
  label: string;
  amount: number;
  type: "credit" | "debit";
  date: string;
}

function formatUGX(n: number) {
  return "UGX " + n.toLocaleString("en-UG");
}

function greeting(t: (key: string) => string) {
  const h = new Date().getHours();
  if (h < 12) return t("home.goodMorning") + " 👋";
  if (h < 17) return t("home.goodAfternoon") + " 👋";
  return t("home.goodEvening") + " 👋";
}

export function HomeScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state, markNotificationsRead } = useAppContext();
  const user = state.user;
  const loan = state.loan;
  const credit = state.credit;
  const unread = state.unreadNotifications;

  const [recentTxns, setRecentTxns] = useState<TransactionRow[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState(false);

  useEffect(() => {
    if (!state.session.token) return;
    let active = true;
    setTxnLoading(true);
    setTxnError(false);
    api
      .getTransactions(state.session.token!)
      .then((res) => {
        if (!active) return;
        const rows: TransactionRow[] = (res.transactions ?? [])
          .slice(0, 5)
          .map((t: Record<string, unknown>) => ({
            id: String(t.id ?? ""),
            label: String(t.description ?? t.type ?? "Transaction"),
            amount: Number(t.amount ?? 0),
            type: (Number(t.amount ?? 0) >= 0 ? "credit" : "debit") as "credit" | "debit",
            date: t.created_at
              ? new Date(String(t.created_at)).toLocaleDateString("en-UG", { month: "short", day: "numeric" })
              : "—",
          }));
        setRecentTxns(rows);
        setTxnError(false);
      })
      .catch(() => {
        // Surface the failure instead of silently showing an empty section —
        // an empty list must only mean "no transactions", never "fetch failed".
        if (active) setTxnError(true);
      })
      .finally(() => {
        if (active) setTxnLoading(false);
      });
    return () => { active = false; };
  }, [state.session.token]);

  const displayTxns = recentTxns.length > 0 ? recentTxns.slice(0, 3) : [];

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pt-4 pb-4"
        style={{ background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 44, height: 44, borderRadius: 22,
              background: "rgba(255,255,255,0.25)", border: "2px solid rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}
          >
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 18, fontWeight: 700, color: "white" }}>{user?.initials ?? "?"}</span>
            }
          </div>
          <div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{greeting(t)}</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{user?.fullName ?? "—"}</p>
          </div>
        </div>
        <button
          onClick={() => { onNavigate("notifications"); markNotificationsRead(); }}
          style={{
            width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.2)",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", cursor: "pointer",
          }}
        >
          <Bell size={20} color="white" />
          {unread > 0 && (
            <div style={{ width: 8, height: 8, borderRadius: 4, background: "#EF4444", position: "absolute", top: 8, right: 8, border: "1.5px solid #E05A2B" }} />
          )}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ paddingBottom: 80 }}>
        {/* Available Credit Card */}
        <div
          className="p-5 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #FFF0E8, #FFDCC8)",
            border: "1px solid #FFDCC8",
            boxShadow: "0 2px 12px rgba(255,107,53,0.1)",
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{t("home.availableCredit")}</p>
              <p style={{ fontSize: 30, fontWeight: 800, color: "#E05A2B", letterSpacing: -1, marginTop: 2 }}>
                {formatUGX(loan?.availableCredit ?? 0)}
              </p>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#C4920A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrendingUp size={18} color="white" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight size={14} color="#10B981" />
              {loan?.creditIncreaseFromLastMonth ? (
                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 500 }}>
                  +{formatUGX(loan.creditIncreaseFromLastMonth)} from last month
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 500 }}>
                  {formatUGX(loan?.availableCredit ?? 0)} available
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigate("dashboard")}
              style={{ fontSize: 11, fontWeight: 700, color: "#FF6B35", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {t("home.dashboard")} →
            </button>
          </div>
        </div>

        {/* Next Payment Card */}
        {loan?.nextPayment && (
          <div
            className="p-4 rounded-2xl"
            style={{
              background: "white",
              border: "1px solid #F3F4F6",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "#FFF7ED",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Calendar size={18} color="#F59E0B" />
                </div>
                <div>
                  <p style={{ fontSize: 12, color: "#6B7280" }}>{t("home.nextPayment")}</p>
                  <p style={{ fontSize: 17, fontWeight: 700, color: "#1F2937" }}>
                    {formatUGX(loan.nextPayment.amount)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p style={{ fontSize: 12, color: "#6B7280" }}>{t("home.dueDate")}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#EF4444" }}>{loan.nextPayment.dueDate}</p>
                <p style={{ fontSize: 11, color: "#F59E0B", fontWeight: 500 }}>{loan.nextPayment.daysLeft} days left</p>
              </div>
            </div>
          </div>
        )}

        {/* Apply for Loan */}
        <button
          onClick={() => onNavigate("loan-apply")}
          className="w-full flex items-center justify-center gap-2"
          style={{
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #FF6B35, #E05A2B)",
            color: "white",
            fontSize: 17,
            fontWeight: 700,
            border: "none",
            boxShadow: "0 6px 20px rgba(255,107,53,0.35)",
          }}
        >
          + {t("home.applyLoan")}
        </button>

        {/* Stats row */}
        <div className="flex gap-3">
          {/* Savings */}
          <div
            className="flex-1 p-4 rounded-2xl"
            onClick={() => onNavigate("goals")}
            style={{
              background: "white",
              border: "1px solid #F3F4F6",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              cursor: "pointer",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank size={16} color="#10B981" />
              <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>{t("home.savings")}</span>
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#065F46" }}>
              {formatUGX(state.savingsBalance)}
            </p>
          </div>

          {/* Credit Score */}
          <div
            className="flex-1 p-4 rounded-2xl"
            style={{
              background: "white",
              border: "1px solid #F3F4F6",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              cursor: "pointer",
            }}
            onClick={() => onNavigate("credit-dashboard")}
          >
            <div className="flex items-center gap-2 mb-2">
              <Star size={16} color="#F59E0B" />
              <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>{t("home.creditScore")}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#1F2937" }}>{credit?.score ?? "—"}</p>
            <div className="flex items-center gap-1 mt-1">
              <ArrowUpRight size={12} color="#10B981" />
              <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>{credit?.tier ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity — fetched from API */}
        <div
          className="p-4 rounded-2xl"
          style={{ background: "white", border: "1px solid #F3F4F6", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{t("home.recentActivity")}</p>
            <button
              onClick={() => onNavigate("loan-history")}
              style={{ fontSize: 12, color: "#FF6B35", fontWeight: 600, border: "none", background: "none" }}
            >
              {t("common.viewAll")}
            </button>
          </div>
          {txnLoading && (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "12px 0" }}>{t("common.loading")}…</p>
          )}
          {!txnLoading && txnError && (
            <p style={{ fontSize: 13, color: "#EF4444", textAlign: "center", padding: "12px 0" }}>{t("home.txnLoadError")}</p>
          )}
          {!txnLoading && !txnError && displayTxns.length === 0 && (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "12px 0" }}>{t("home.noRecentTxns")}</p>
          )}
          {displayTxns.map((item, i) => (
            <div key={item.id ?? i} className="flex items-center justify-between py-2" style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: item.type === "credit" ? "#F0FDF4" : "#FEF2F2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{item.type === "credit" ? "↑" : "↓"}</span>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF" }}>{item.date}</p>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: item.type === "credit" ? "#10B981" : "#EF4444" }}>
                {item.amount >= 0 ? "+" : ""}{formatUGX(Math.abs(item.amount))}
              </span>
            </div>
          ))}
        </div>

        {/* Active Loan card */}
        {loan?.activeLoan && (
          <div
            className="p-4 rounded-2xl"
            onClick={() => onNavigate("loan-detail")}
            style={{
              background: "white",
              border: "1px solid #F3F4F6",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              cursor: "pointer",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{t("home.activeLoan")}</p>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#10B981",
                  background: "#F0FDF4",
                  padding: "2px 10px",
                  borderRadius: 20,
                  border: "1px solid #A7F3D0",
                }}
              >
                {loan.activeLoan.status}
              </span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#1F2937" }}>{formatUGX(loan.activeLoan.amount)}</p>
            <div className="mt-2">
              <div className="flex justify-between mb-1">
                <span style={{ fontSize: 11, color: "#6B7280" }}>{t("home.repaid")}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#10B981" }}>{loan.activeLoan.repaidPercent}%</span>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3 }}>
                <div style={{ width: `${loan.activeLoan.repaidPercent}%`, height: "100%", background: "#10B981", borderRadius: 3 }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}