import { ArrowLeft, Plus, ArrowUpRight, ArrowDownLeft, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

interface WalletTxn { id: string; label: string; amount: number; type: "in" | "out"; date: string; method: string; }

const TXN_LABELS: Record<string, string> = {
  loan_disbursement: "Loan disbursed",
  loan_payment: "Loan repayment",
  savings_deposit: "Savings deposit",
  savings_withdrawal: "Savings withdrawal",
  wallet_topup: "Wallet top-up",
};
const INFLOW_TYPES = new Set(["loan_disbursement", "savings_withdrawal", "wallet_topup"]);

export function WalletOverviewScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const [recent, setRecent] = useState<WalletTxn[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setTxnLoading(true);
    setTxnError(false);
    api.getTransactions(token)
      .then((res) => {
        if (!active) return;
        const rows: WalletTxn[] = (res.transactions ?? [])
          .slice(0, 5)
          .map((tx: Record<string, unknown>) => {
            const type = String(tx.type ?? "");
            return {
              id: String(tx.id ?? ""),
              label: TXN_LABELS[type] ?? type ?? "Transaction",
              amount: Number(tx.amount ?? 0),
              type: (INFLOW_TYPES.has(type) ? "in" : "out") as "in" | "out",
              date: tx.created_at
                ? new Date(String(tx.created_at)).toLocaleDateString("en-UG", { month: "short", day: "numeric" })
                : "—",
              method: String(tx.status ?? ""),
            };
          });
        setRecent(rows);
        setTxnError(false);
      })
      .catch(() => { if (active) setTxnError(true); })
      .finally(() => { if (active) setTxnLoading(false); });
    return () => { active = false; };
  }, [token]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #FF6B35, #E05A2B)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("home")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>{t("wallet.myWallet")}</span>
        </div>
        <button onClick={() => onNavigate("add-payment-method")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 600 }}>
          <Plus size={14} /> {t("wallet.addMethod")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 90px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Payment methods — labels only; balances/numbers come from the user's
            linked accounts on the Manage screen, never fabricated here. */}
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "4px 0 0" }}>{t("wallet.paymentMethods")}</p>
        {[
          { logo: "🟡", name: "MTN MoMo", color: "#F59E0B" },
          { logo: "🔴", name: "Airtel Money", color: "#EF4444" },
          { logo: "🏦", name: "Bank Transfer", color: "#FF6B35" },
        ].map((m) => (
          <div key={m.name} style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 32 }}>{m.logo}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{m.name}</span>
            </div>
            <button onClick={() => onNavigate("payment-methods-list")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", fontSize: 11, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>{t("wallet.manage")}</button>
          </div>
        ))}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { Icon: Send, label: t("wallet.payLoan"), color: "#FF6B35", bg: "#FFF0E8", screen: "make-payment" },
            { Icon: ArrowUpRight, label: t("wallet.addMoney"), color: "#10B981", bg: "#F0FDF4", screen: "add-money" },
            { Icon: ArrowDownLeft, label: t("wallet.withdraw"), color: "#F59E0B", bg: "#FFF7ED", screen: "withdraw-savings" },
          ].map(({ Icon, label, color, bg, screen }) => (
            <button key={label} onClick={() => onNavigate(screen)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 10px", borderRadius: 14, background: "white", border: "1px solid #F3F4F6", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={20} color={color} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Recent transactions */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{t("wallet.recentTransactions")}</span>
            <button onClick={() => onNavigate("transaction-history")} style={{ fontSize: 12, color: "#FF6B35", fontWeight: 600, border: "none", background: "none", cursor: "pointer" }}>{t("wallet.viewAll")}</button>
          </div>
          {txnLoading ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#9CA3AF", fontSize: 12 }}>Loading…</div>
          ) : txnError ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#EF4444", fontSize: 12 }}>Couldn't load transactions. Pull to refresh.</div>
          ) : recent.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#9CA3AF", fontSize: 12 }}>No transactions yet</div>
          ) : (
            recent.map((tx, i) => (
              <div key={tx.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < recent.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: tx.type === "in" ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {tx.type === "in" ? <ArrowDownLeft size={16} color="#10B981" /> : <ArrowUpRight size={16} color="#EF4444" />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{tx.label}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{tx.date} · {tx.method}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: tx.type === "in" ? "#10B981" : "#EF4444" }}>
                  {tx.type === "in" ? "+" : "-"}{formatUGX(Math.abs(tx.amount))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <BottomNav active="wallet" onNavigate={onNavigate} />
    </div>
  );
}
