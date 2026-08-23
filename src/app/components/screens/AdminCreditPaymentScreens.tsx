import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { CustomerRow } from "../../api/types-compat";
import { formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

const TXN_TYPE_LABELS: Record<string, string> = {
  loan_disbursement: "Loan Disbursed",
  loan_payment: "Repayment",
  wallet_topup: "Wallet Top-up",
};
const labelForType = (type: string) => TXN_TYPE_LABELS[type] ?? type;

function fmtDate(iso: unknown) {
  if (!iso) return "—";
  const date = new Date(String(iso));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-UG", { month: "short", day: "numeric" });
}
function isToday(iso: unknown) {
  if (!iso) return false;
  const date = new Date(String(iso));
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}
function LoadingBlock() {
  return <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>;
}
function ErrorBlock({ message }: { message: string }) {
  return <div style={{ textAlign: "center", padding: "48px 0", color: "#EF4444", fontSize: 13 }}>{message}</div>;
}
function EmptyDetail({ message }: { message: string }) {
  return <AdminCard><div style={{ textAlign: "center", padding: "32px 0" }}><p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>No record selected</p><p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0" }}>{message}</p></div></AdminCard>;
}
function useToken() {
  return useAppContext().state.session.token;
}

export function AdminCreditScoresListScreen({ onNavigate }: Props) {
  const token = useToken();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    api.getCustomers(token)
      .then((res) => { if (active) setCustomers(res.customers ?? []); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load customers"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  return <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Scores">
    <AdminPageHeader title="Credit Scores" subtitle="Credit scores are computed per customer on demand" />
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", marginBottom: 16 }}><p style={{ fontSize: 12, color: "#475569", margin: 0 }}>A customer's credit score is computed from verified credit evidence and repayment behaviour.</p></div>
    {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : customers.length === 0 ? <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No customers yet</div> : <AdminTable columns={["Customer", "Phone", "Verified", "Loans", "Joined"]} rows={customers.map((customer) => [customer.full_name || "—", customer.phone || "—", <StatusBadge key={customer.id} status={customer.verified ? "verified" : "pending"} />, String(customer.loans_total ?? 0), fmtDate(customer.created_at)])} onRowClick={() => onNavigate("admin-credit-detail")} />}
  </AdminLayout>;
}

export function AdminCreditScoreDetailScreen({ onNavigate }: Props) {
  return <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Score Detail"><AdminPageHeader title="Credit Score Detail" /><EmptyDetail message="Open a customer profile to view its verified evidence and score breakdown." /></AdminLayout>;
}

export function AdminCreditModelScreen({ onNavigate }: Props) {
  const [weights, setWeights] = useState({ mobileMoney: 30, crb: 20, identity: 15, repayment: 35 });
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Score Model">
    <AdminPageHeader title="Credit Score Model" subtitle="Verified evidence and repayment behaviour" />
    <div style={{ maxWidth: 700 }}><AdminCard><p style={{ fontSize: 12, color: "#64748B" }}>Current total: {total}%</p>{Object.entries(weights).map(([key, value]) => <div key={key} style={{ marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{key}</label><span style={{ fontSize: 13, fontWeight: 800, color: "#0B5E3A" }}>{value}%</span></div><input type="range" min={0} max={50} value={value} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} style={{ width: "100%", accentColor: "#0B5E3A" }} /></div>)}</AdminCard></div>
  </AdminLayout>;
}

export function AdminAllTransactionsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    api.getTransactions(token).then((res) => { if (active) setTransactions(res.transactions ?? []); }).catch((e) => { if (active) setError(e?.message ?? "Could not load transactions"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const todays = transactions.filter((transaction) => isToday(transaction.createdAt));
  const completed = todays.filter((transaction) => transaction.status === "completed");
  const failed = todays.filter((transaction) => transaction.status === "failed");
  const volume = completed.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
  const decided = completed.length + failed.length;
  const successRate = decided ? Math.round((completed.length / decided) * 1000) / 10 : 0;
  return <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="All Transactions"><AdminPageHeader title="All Transactions" subtitle="Provider-confirmed lending and repayment activity" />{loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : <><div style={{ display: "flex", gap: 14, marginBottom: 20 }}><StatCard label="Today's Volume" value={formatUGX(volume)} color="#0B5E3A" icon={<></>} /><StatCard label="Transactions Today" value={todays.length.toLocaleString()} color="#12B984" icon={<></>} /><StatCard label="Failed Today" value={failed.length.toLocaleString()} color="#EF4444" icon={<></>} /><StatCard label="Success Rate" value={`${successRate}%`} color="#8B5CF6" icon={<></>} /></div>{transactions.length === 0 ? <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No transactions yet</div> : <AdminTable columns={["TXN ID", "Type", "Amount", "Date", "Status"]} rows={transactions.map((transaction) => [String(transaction.id ?? "").slice(0, 8), labelForType(String(transaction.type)), formatUGX(Number(transaction.amount ?? 0)), fmtDate(transaction.createdAt), <StatusBadge key={String(transaction.id)} status={String(transaction.status ?? "")} />])} onRowClick={() => onNavigate("admin-transaction-detail")} />}</>}</AdminLayout>;
}

export function AdminTransactionDetailScreen({ onNavigate }: Props) {
  return <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Transaction Detail"><AdminPageHeader title="Transaction Detail" /><div style={{ maxWidth: 600 }}><EmptyDetail message="Open a transaction from the list to inspect its provider and reconciliation details." /></div></AdminLayout>;
}

export function AdminPaymentProcessingScreen({ onNavigate }: Props) {
  return <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Payment Operations"><AdminPageHeader title="Payment Operations" subtitle="Manual settlement is intentionally unavailable" /><AdminCard><div style={{ padding: "12px 14px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA" }}><p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>Provider-confirmed financial transactions cannot be manually marked completed. Use reconciliation tooling to investigate failed or pending movements.</p></div></AdminCard></AdminLayout>;
}

export function AdminFailedTransactionsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    api.getTransactions(token).then((res) => { if (active) setTransactions(res.transactions ?? []); }).catch((e) => { if (active) setError(e?.message ?? "Could not load transactions"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const failed = transactions.filter((transaction) => transaction.status === "failed");
  const failedToday = failed.filter((transaction) => isToday(transaction.createdAt));
  return <AdminLayout activeScreen="admin-failed-transactions" onNavigate={onNavigate} title="Failed Transactions"><AdminPageHeader title="Failed Transactions" subtitle="Provider requests requiring investigation" action={<div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA" }}><AlertTriangle size={14} color="#EF4444" /><span style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>{failedToday.length} today</span></div>} />{loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : failed.length === 0 ? <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No failed transactions</div> : <AdminTable columns={["TXN ID", "Type", "Amount", "Date", "Status"]} rows={failed.map((transaction) => [String(transaction.id ?? "").slice(0, 8), labelForType(String(transaction.type)), formatUGX(Number(transaction.amount ?? 0)), fmtDate(transaction.createdAt), <StatusBadge key={String(transaction.id)} status="failed" />])} />}</AdminLayout>;
}
