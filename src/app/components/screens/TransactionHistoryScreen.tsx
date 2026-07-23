import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { setSelectedTransaction } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

type Filter = "all" | "loans" | "savings" | "payments";

interface TxnItem {
  id: string;
  label: string;
  sub: string;
  amount: number;
  type: "in" | "out";
  date: string;
  category: Filter;
  rawType: string;
  status: string;
  reference: string;
  createdAtISO: string;
}

const TYPE_CATEGORY: Record<string, Filter> = {
  loan_disbursement: "loans",
  loan_payment: "payments",
  savings_deposit: "savings",
  savings_withdrawal: "savings",
};

const TYPE_LABEL: Record<string, string> = {
  loan_disbursement: "Loan Disbursed",
  loan_payment: "Loan Repayment",
  savings_deposit: "Savings Deposit",
  savings_withdrawal: "Savings Withdrawal",
};

function mapTxn(r: Record<string, unknown>): TxnItem {
  const txnType = String(r.type ?? "");
  const amount = Number(r.amount ?? 0);
  const isIn = txnType === "loan_disbursement";
  const reference = r.loan_id ? String(r.loan_id) : String(r.transaction_id ?? "");
  return {
    id: String(r.id),
    label: TYPE_LABEL[txnType] ?? txnType,
    sub: reference,
    amount,
    type: isIn ? "in" : "out",
    date: new Date(String(r.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    category: TYPE_CATEGORY[txnType] ?? "payments",
    rawType: txnType,
    status: String(r.status ?? "completed"),
    reference,
    createdAtISO: String(r.created_at ?? new Date().toISOString()),
  };
}

export function TransactionHistoryScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [txns, setTxns] = useState<TxnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getTransactions(token)
      .then(({ transactions }) => setTxns(transactions.map(mapTxn)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const list = txns.filter((t) => {
    const matchFilter = filter === "all" || t.category === filter;
    const matchSearch = t.label.toLowerCase().includes(search.toLowerCase()) || t.sub.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ background: "linear-gradient(135deg, #F4612B, #D9531F)", padding: "16px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => onNavigate("wallet")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>Transaction History</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px" }}>
          <Search size={14} color="rgba(255,255,255,0.7)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "white", flex: 1 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "10px 16px", background: "white", borderBottom: "1px solid #F3F4F6", overflowX: "auto", scrollbarWidth: "none" }}>
        {(["all", "loans", "savings", "payments"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: filter === f ? "#F4612B" : "#F3F4F6", color: filter === f ? "white" : "#6B7280", textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 90px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 14 }}>Loading transactions…</p>
          </div>
        )}
        {!loading && list.map((t) => (
          <button key={t.id} onClick={() => { setSelectedTransaction({ id: t.id, type: t.rawType, amount: t.amount, status: t.status, reference: t.reference, createdAt: t.createdAtISO }); onNavigate("transaction-detail"); }} style={{ background: "white", borderRadius: 14, padding: "14px 16px", border: "1px solid #F3F4F6", boxShadow: "0 2px 4px rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.type === "in" ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {t.type === "in" ? <ArrowDownLeft size={18} color="#12B984" /> : <ArrowUpRight size={18} color="#EF4444" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</p>
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>{t.sub ? `${t.sub} · ` : ""}{t.date}</p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: t.type === "in" ? "#12B984" : "#EF4444", flexShrink: 0 }}>
              {t.type === "in" ? "+" : ""}{ugx(Math.abs(t.amount))}
            </span>
          </button>
        ))}
        {!loading && list.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 16 }}>No transactions yet</p>
            <p style={{ fontSize: 13 }}>Your transactions will appear here once you have loan or savings activity.</p>
          </div>
        )}
      </div>

      <BottomNav active="wallet" onNavigate={onNavigate} />
    </div>
  );
}
