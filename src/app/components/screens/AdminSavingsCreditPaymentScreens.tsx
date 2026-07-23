/**
 * A5.1-A5.4 Savings | A6.1-A6.3 Credit | A7.1-A7.4 Payments
 *
 * Every metric on these screens is computed from real rows (getSavingsOverview,
 * getInvestorReport, getTransactions, getCustomers). No hardcoded analytics.
 */

import React, { useState, useEffect } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { InvestorReport, CustomerRow } from "../../api/types-compat";
import { formatUGX } from "../../lib/export";

interface Props { onNavigate: (s: string) => void; }

const TXN_TYPE_LABELS: Record<string, string> = {
  loan_disbursement: "Loan Disbursed",
  loan_payment: "Repayment",
  savings_deposit: "Savings Deposit",
  savings_withdrawal: "Savings Withdrawal",
  wallet_topup: "Wallet Top-up",
};
const labelForType = (t: string) => TXN_TYPE_LABELS[t] ?? t;

function fmtDate(iso: unknown) {
  if (!iso) return "—";
  const d = new Date(String(iso));
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const isToday = (iso: unknown) => {
  if (!iso) return false;
  const d = new Date(String(iso));
  return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
};

function LoadingBlock() {
  return <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>;
}
function ErrorBlock({ message }: { message: string }) {
  return <div style={{ textAlign: "center", padding: "48px 0", color: "#EF4444", fontSize: 13 }}>{message}</div>;
}
function EmptyDetail({ message }: { message: string }) {
  return (
    <AdminCard>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: 0 }}>No record selected</p>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0" }}>{message}</p>
      </div>
    </AdminCard>
  );
}

// ── shared token-loaded data hook ──────────────────────────────────────────────
function useToken() {
  const { state } = useAppContext();
  return state.session.token;
}

// A5.1
export function AdminAllSavingsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [overview, setOverview] = useState<{ accounts: { user_id: string; full_name: string; balance: number }[]; total: number } | null>(null);
  const [report, setReport] = useState<InvestorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true); setError(null);
    Promise.all([api.getSavingsOverview(token), api.getInvestorReport(token)])
      .then(([ov, rep]) => { if (active) { setOverview(ov); setReport(rep); } })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load savings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const accounts = overview?.accounts ?? [];
  const total = overview?.total ?? 0;
  const avgBalance = accounts.length > 0 ? Math.round(total / accounts.length) : 0;

  return (
    <AdminLayout activeScreen="admin-all-savings" onNavigate={onNavigate} title="Savings Accounts">
      <AdminPageHeader
        title="All Savings Accounts"
        subtitle={loading ? "Loading…" : `${accounts.length} savings accounts · ${formatUGX(total)} total`}
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"white",border:"1px solid #E2E8F0",color:"#374151",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export</button>}
      />
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <>
          <div style={{ display:"flex",gap:14,marginBottom:20 }}>
            <StatCard label="Total Savings" value={formatUGX(total)} color="#10B981" icon={<></>}/>
            <StatCard label="Active Accounts" value={accounts.length.toLocaleString()} color="#FF6B35" icon={<></>}/>
            <StatCard label="Avg Balance" value={formatUGX(avgBalance)} color="#8B5CF6" icon={<></>}/>
            <StatCard label="Total Deposits" value={formatUGX(report?.savings.deposits ?? 0)} color="#F59E0B" icon={<></>}/>
          </div>
          {accounts.length === 0 ? (
            <div style={{ textAlign:"center",padding:"32px 0",color:"#9CA3AF",fontSize:13 }}>No savings accounts yet</div>
          ) : (
            <AdminTable
              columns={["Customer","Balance"]}
              rows={accounts.map((a) => [a.full_name || "—", formatUGX(a.balance)])}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}

// A5.2 — no per-account data source / id wiring; honest empty state instead of fabricated numbers.
export function AdminSavingsDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-all-savings" onNavigate={onNavigate} title="Savings Detail">
      <AdminPageHeader title="Savings Account Detail"/>
      <EmptyDetail message="Per-account savings detail is not available yet. Open an account from the savings list once detail routing is wired to real records." />
    </AdminLayout>
  );
}

// A5.3
export function AdminSavingsTransactionsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [txns, setTxns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true); setError(null);
    api.getTransactions(token)
      .then((res) => { if (active) setTxns(res.transactions ?? []); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load transactions"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const savingsTxns = txns.filter((t) => t.type === "savings_deposit" || t.type === "savings_withdrawal");

  return (
    <AdminLayout activeScreen="admin-savings-transactions" onNavigate={onNavigate} title="Savings Transactions">
      <AdminPageHeader title="Savings Transactions" subtitle="All deposits and withdrawals"/>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : savingsTxns.length === 0 ? (
        <div style={{ textAlign:"center",padding:"32px 0",color:"#9CA3AF",fontSize:13 }}>No savings transactions yet</div>
      ) : (
        <AdminTable
          columns={["Date","Type","Amount","Status"]}
          rows={savingsTxns.map((t) => [
            fmtDate(t.created_at),
            labelForType(String(t.type)),
            formatUGX(Number(t.amount ?? 0)),
            <StatusBadge key={String(t.id)} status={String(t.status ?? "")} />,
          ])}
        />
      )}
    </AdminLayout>
  );
}

// A5.4
export function AdminInterestRateScreen({ onNavigate }: Props) {
  const [savingsRate, setSavingsRate] = useState("5.2");
  return (
    <AdminLayout activeScreen="admin-interest-rate" onNavigate={onNavigate} title="Interest Rate Settings">
      <AdminPageHeader title="Interest Rate Settings" subtitle="Configure savings and loan interest rates"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Savings Interest Rate</h3>
          <div style={{ display:"flex",alignItems:"center",gap:16 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Annual Rate (%)</label>
              <input type="number" value={savingsRate} onChange={(e)=>setSavingsRate(e.target.value)} step="0.1" min="0" max="20" style={{ width:"100%",height:46,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:24,fontWeight:800,color:"#10B981",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:0 }}>Monthly equivalent</p>
              <p style={{ fontSize:22,fontWeight:800,color:"#10B981",margin:"4px 0" }}>{(Number(savingsRate)/12).toFixed(2)}%</p>
            </div>
          </div>
          <div style={{ marginTop:16,padding:"12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0" }}>
            <p style={{ fontSize:12,color:"#065F46",margin:0 }}>Impact: On UGX 1M balance, customers earn UGX {Math.round(10000000*Number(savingsRate)/100/12).toLocaleString()} per month.</p>
          </div>
          <button style={{ width:"100%",height:44,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Rate Settings</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A6.1 — real customer list. No aggregate credit-score source exists, so the
// average/distribution/score columns are removed rather than fabricated.
export function AdminCreditScoresListScreen({ onNavigate }: Props) {
  const token = useToken();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true); setError(null);
    api.getCustomers(token)
      .then((res) => { if (active) setCustomers(res.customers ?? []); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load customers"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Scores">
      <AdminPageHeader title="Credit Scores" subtitle="Credit scores are computed per customer on demand"/>
      <div style={{ padding:"12px 14px",borderRadius:10,background:"#F8FAFC",border:"1px solid #E2E8F0",marginBottom:16 }}>
        <p style={{ fontSize:12,color:"#475569",margin:0 }}>A customer's credit score is computed by the scoring engine when their profile is opened. Aggregate score distribution is not stored, so it is not shown here.</p>
      </div>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : customers.length === 0 ? (
        <div style={{ textAlign:"center",padding:"32px 0",color:"#9CA3AF",fontSize:13 }}>No customers yet</div>
      ) : (
        <AdminTable
          columns={["Customer","Phone","Verified","Loans","Joined"]}
          rows={customers.map((c) => [
            c.full_name || "—",
            c.phone || "—",
            <StatusBadge key={c.id} status={c.verified ? "verified" : "pending"} />,
            String(c.loans_total ?? 0),
            fmtDate(c.created_at),
          ])}
          onRowClick={()=>onNavigate("admin-credit-detail")}
        />
      )}
    </AdminLayout>
  );
}

// A6.2 — no per-customer score detail source / id wiring; honest empty state.
export function AdminCreditScoreDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Score Detail">
      <AdminPageHeader title="Credit Score Detail"/>
      <EmptyDetail message="Per-customer score breakdown and history are computed on demand by the scoring engine and are not available on this screen yet." />
    </AdminLayout>
  );
}

// A6.3
export function AdminCreditModelScreen({ onNavigate }: Props) {
  const [weights, setWeights] = useState({ payment:35,utilization:30,history:15,mix:10,inquiries:10 });
  return (
    <AdminLayout activeScreen="admin-credit-scores" onNavigate={onNavigate} title="Credit Score Model">
      <AdminPageHeader title="Credit Score Model Settings" subtitle="Configure the scoring algorithm weights"/>
      <div style={{ maxWidth:700 }}>
        <AdminCard style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 4px" }}>Scoring Weights</h3>
          <p style={{ fontSize:12,color:"#64748B",margin:"0 0 16px" }}>Weights must sum to 100%. Current total: {Object.values(weights).reduce((a,b)=>a+b,0)}%</p>
          {Object.entries(weights).map(([k,v])=>(
            <div key={k} style={{ marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                <label style={{ fontSize:13,fontWeight:600,color:"#374151",textTransform:"capitalize" }}>{k.replace("_"," ")}</label>
                <span style={{ fontSize:13,fontWeight:800,color:"#FF6B35" }}>{v}%</span>
              </div>
              <input type="range" min={0} max={50} value={v}
                onChange={(e)=>setWeights((w)=>({...w,[k]:Number(e.target.value)}))}
                style={{ width:"100%",accentColor:"#FF6B35" }}/>
            </div>
          ))}
          <button style={{ width:"100%",height:44,marginTop:8,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Model Configuration</button>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Model Thresholds</h3>
          {[["Minimum score to qualify","580"],["Excellent threshold (green)","750"],["High-risk threshold","500"],["Auto-approve above","720"],["Auto-reject below","500"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span>
              <input defaultValue={v} style={{ width:70,height:32,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 10px",fontSize:13,fontWeight:700,color:"#0F172A",textAlign:"center",outline:"none" }}/>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A7.1
export function AdminAllTransactionsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [txns, setTxns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true); setError(null);
    api.getTransactions(token)
      .then((res) => { if (active) setTxns(res.transactions ?? []); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load transactions"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const todays = txns.filter((t) => isToday(t.created_at));
  const todaysCompleted = todays.filter((t) => t.status === "completed");
  const todaysFailed = todays.filter((t) => t.status === "failed");
  const todaysVolume = todaysCompleted.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const decided = todaysCompleted.length + todaysFailed.length;
  const successRate = decided > 0 ? Math.round((todaysCompleted.length / decided) * 1000) / 10 : 0;

  return (
    <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="All Transactions">
      <AdminPageHeader title="All Transactions" subtitle="Complete transaction history across all customers"/>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <>
          <div style={{ display:"flex",gap:14,marginBottom:20 }}>
            <StatCard label="Today's Volume" value={formatUGX(todaysVolume)} color="#FF6B35" icon={<></>}/>
            <StatCard label="Transactions Today" value={todays.length.toLocaleString()} color="#10B981" icon={<></>}/>
            <StatCard label="Failed Today" value={todaysFailed.length.toLocaleString()} color="#EF4444" icon={<></>}/>
            <StatCard label="Success Rate (Today)" value={`${successRate}%`} color="#8B5CF6" icon={<></>}/>
          </div>
          {txns.length === 0 ? (
            <div style={{ textAlign:"center",padding:"32px 0",color:"#9CA3AF",fontSize:13 }}>No transactions yet</div>
          ) : (
            <AdminTable
              columns={["TXN ID","Type","Amount","Date","Status"]}
              rows={txns.map((t) => [
                String(t.id ?? "").slice(0, 8),
                labelForType(String(t.type)),
                formatUGX(Number(t.amount ?? 0)),
                fmtDate(t.created_at),
                <StatusBadge key={String(t.id)} status={String(t.status ?? "")} />,
              ])}
              onRowClick={()=>onNavigate("admin-transaction-detail")}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}

// A7.2 — no per-transaction detail id wiring; honest empty state.
export function AdminTransactionDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Transaction Detail">
      <AdminPageHeader title="Transaction Detail"/>
      <div style={{ maxWidth:600 }}>
        <EmptyDetail message="Open a transaction from the list to view its details once detail routing is wired to real records." />
      </div>
    </AdminLayout>
  );
}

// A7.3
export function AdminPaymentProcessingScreen({ onNavigate }: Props) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn");
  return (
    <AdminLayout activeScreen="admin-all-transactions" onNavigate={onNavigate} title="Manual Payment">
      <AdminPageHeader title="Manual Payment Processing" subtitle="Process payments on behalf of customers"/>
      <div style={{ maxWidth:600 }}>
        <div style={{ padding:"12px 14px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA",marginBottom:16 }}>
          <p style={{ fontSize:12,color:"#92400E",margin:0 }}>⚠ Only use this for manually processing payments. All actions are logged.</p>
        </div>
        <AdminCard>
          {[
            { label:"Customer / Loan ID", placeholder:"Search customer or enter Loan ID..." },
            { label:"Phone Number", placeholder:"+256 7XX XXX XXX", value:phone, set:setPhone },
            { label:"Amount (UGX)", placeholder:"Enter amount...", value:amount, set:setAmount },
          ].map(({ label,placeholder,value,set })=>(
            <div key={label} style={{ marginBottom:14 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>{label}</label>
              <input value={value||""} onChange={(e)=>set&&set(e.target.value)} placeholder={placeholder} style={{ width:"100%",height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,color:"#1F2937",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
            </div>
          ))}
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Payment Method</label>
            <div style={{ display:"flex",gap:8 }}>
              {["mtn","airtel","bank"].map((m)=>(
                <button key={m} onClick={()=>setMethod(m)} style={{ flex:1,height:40,borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:method===m?"#FF6B35":"#F3F4F6",color:method===m?"white":"#6B7280",textTransform:"capitalize" }}>{m==="mtn"?"MTN MoMo":m==="airtel"?"Airtel Money":"Bank"}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Notes</label>
            <textarea rows={2} placeholder="Reason for manual processing..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          </div>
          <button style={{ width:"100%",height:46,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer" }}>Process Payment</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A7.4
export function AdminFailedTransactionsScreen({ onNavigate }: Props) {
  const token = useToken();
  const [txns, setTxns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Not authenticated"); return; }
    let active = true;
    setLoading(true); setError(null);
    api.getTransactions(token)
      .then((res) => { if (active) setTxns(res.transactions ?? []); })
      .catch((e) => { if (active) setError(e?.message ?? "Could not load transactions"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const failed = txns.filter((t) => t.status === "failed");
  const failedToday = failed.filter((t) => isToday(t.created_at));

  return (
    <AdminLayout activeScreen="admin-failed-transactions" onNavigate={onNavigate} title="Failed Transactions">
      <AdminPageHeader title="Failed Transactions" subtitle="Transactions that failed to process"
        action={<div style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA" }}><AlertTriangle size={14} color="#EF4444"/><span style={{ fontSize:12,fontWeight:700,color:"#991B1B" }}>{failedToday.length} failures today</span></div>}
      />
      <div style={{ padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16 }}>
        <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>Review and manually process failed transactions to ensure customers receive their funds.</p>
      </div>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : failed.length === 0 ? (
        <div style={{ textAlign:"center",padding:"32px 0",color:"#9CA3AF",fontSize:13 }}>No failed transactions</div>
      ) : (
        <AdminTable
          columns={["TXN ID","Type","Amount","Date","Action"]}
          rows={failed.map((t) => [
            String(t.id ?? "").slice(0, 8),
            labelForType(String(t.type)),
            formatUGX(Number(t.amount ?? 0)),
            fmtDate(t.created_at),
            <button key={String(t.id)} onClick={()=>onNavigate("admin-payment-processing")} style={{ padding:"4px 10px",borderRadius:6,background:"#FF6B35",color:"white",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Retry</button>,
          ])}
        />
      )}
    </AdminLayout>
  );
}

