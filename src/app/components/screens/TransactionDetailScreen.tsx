import { ArrowLeft, Download, Share2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { getSelectedTransaction, type SelectedTransaction } from "../../lib/selection";
import { downloadReceiptPdf } from "../../lib/receipt";
import { formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

const TYPE_LABEL: Record<string, string> = {
  loan_disbursement: "Loan Disbursement",
  loan_payment: "Loan Repayment",
  savings_deposit: "Savings Deposit",
  savings_withdrawal: "Savings Withdrawal",
  wallet_topup: "Wallet Top-up",
};

function isIncoming(type: string) {
  return type === "loan_disbursement" || type === "wallet_topup" || type === "savings_withdrawal";
}

function mapRaw(r: Record<string, unknown>): SelectedTransaction {
  return {
    id: String(r.id ?? ""),
    type: String(r.type ?? ""),
    amount: Number(r.amount ?? 0),
    status: String(r.status ?? "completed"),
    reference: String(r.loan_id ?? r.transaction_id ?? r.reference ?? ""),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export function TransactionDetailScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const [txn, setTxn] = useState<SelectedTransaction | null>(getSelectedTransaction());
  const [loading, setLoading] = useState(!getSelectedTransaction());

  useEffect(() => {
    // If we arrived without a selected transaction (e.g. deep link), fall back
    // to the customer's most recent real transaction rather than showing fakes.
    if (txn || !token) { setLoading(false); return; }
    api.getTransactions(token)
      .then(({ transactions }) => {
        if (transactions.length > 0) setTxn(mapRaw(transactions[0]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, txn]);

  const label = txn ? (TYPE_LABEL[txn.type] ?? txn.type) : "";
  const incoming = txn ? isIncoming(txn.type) : true;
  const when = txn ? new Date(txn.createdAt) : new Date();
  const statusOk = txn ? ["completed", "success", "paid"].includes(txn.status.toLowerCase()) : true;

  const saveReceipt = () => {
    if (!txn) return;
    downloadReceiptPdf({
      reference: txn.id,
      title: "Transaction Receipt",
      status: statusOk ? "Completed" : txn.status,
      amount: txn.amount,
      dateISO: txn.createdAt,
      rows: [
        { label: "Type", value: label },
        ...(txn.reference ? [{ label: "Reference", value: txn.reference }] : []),
      ],
    });
  };

  const share = async () => {
    if (!txn) return;
    const text = `Kuula — ${label}: ${incoming ? "+" : "-"}${formatUGX(txn.amount)} on ${when.toLocaleDateString("en-GB")} (Ref ${txn.id})`;
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: "Kuula Transaction", text }); return; } catch { /* fall through */ }
    }
    saveReceipt();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 14px", background: "linear-gradient(135deg, #F4612B, #D9531F)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => onNavigate("transaction-history")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Transaction Details</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={share} disabled={!txn} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", cursor: txn ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: txn ? 1 : 0.5 }}>
            <Share2 size={16} color="white" />
          </button>
          <button onClick={saveReceipt} disabled={!txn} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", cursor: txn ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: txn ? 1 : 0.5 }}>
            <Download size={16} color="white" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>Loading transaction…</div>
        ) : !txn ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>No transaction selected</p>
            <p style={{ fontSize: 13 }}>Open a transaction from your history to see its details.</p>
          </div>
        ) : (
          <>
            {/* Status hero */}
            <div style={{ background: "white", borderRadius: 20, padding: "24px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: incoming ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {incoming ? <ArrowDownLeft size={32} color="#12B984" /> : <ArrowUpRight size={32} color="#EF4444" />}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusOk ? "#12B984" : "#F59E0B", background: statusOk ? "#F0FDF4" : "#FFFBEB", padding: "3px 12px", borderRadius: 20, textTransform: "capitalize" }}>
                ● {statusOk ? "Successful" : txn.status}
              </span>
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>{label}</p>
              <p style={{ fontSize: 38, fontWeight: 900, color: incoming ? "#12B984" : "#1F2937", margin: 0, letterSpacing: -1 }}>
                {incoming ? "+" : "-"}{formatUGX(txn.amount)}
              </p>
            </div>

            {/* Details card */}
            <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", marginBottom: 4 }}>Transaction Information</p>
              {[
                { label: "Transaction ID", value: txn.id },
                { label: "Type", value: label },
                ...(txn.reference ? [{ label: "Reference", value: txn.reference }] : []),
                { label: "Date", value: when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Time", value: when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
                { label: "Status", value: statusOk ? "Completed" : txn.status },
              ].map((r, i, arr) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", textAlign: "right", wordBreak: "break-all" }}>{r.value}</span>
                </div>
              ))}
            </div>

            <button onClick={saveReceipt} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 48, borderRadius: 14, background: "#FFF6EF", border: "none", color: "#F4612B", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              <Download size={16} /> Download Receipt (PDF)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
