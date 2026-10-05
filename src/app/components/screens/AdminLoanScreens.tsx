/**
 * Admin Loan Management Screens
 * A3.1 LoanAppsList | A3.2 LoanAppDetail | A3.3 LoanApproval | A3.4 LoanRejection
 * A3.5 ActiveLoansList | A3.6 ActiveLoanDetail | A3.7 RepaymentTracking
 * A3.8 OverdueLoansList | A3.9 OverdueLoanDetail | A3.10 LoanHistoryAll
 */

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, MessageSquare, Phone, Download } from "lucide-react";
import { downloadCsv } from "../../lib/export";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAppContext } from "../../context/AppContext";
import { api, type LoanApplication } from "../../api/client";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A3.1
export function AdminLoanAppsListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const { t } = useTranslation();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const { applications } = await api.getApplications(token);
      setApps(applications);
    } catch { /* keep last known state */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    if (!token) return;
    setBusyId(id);
    try {
      await api.decideApplication(token, id, decision);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = filter === "All"
    ? apps
    : apps.filter((a) => a.status.toLowerCase() === filter.toLowerCase());

  const pendingCount = apps.filter((a) => a.status === "pending").length;

  return (
    <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Loan Applications">
      <AdminPageHeader
        title="Loan Applications"
        subtitle={`${apps.length} total · ${pendingCount} pending`}
        action={
          pendingCount > 0
            ? <span style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B", background: "#FEF3C7", padding: "6px 14px", borderRadius: 8 }}>{pendingCount} Pending</span>
            : undefined
        }
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {(["All", "Pending", "Approved", "Rejected"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: filter === f ? "#0B5E3A" : "white", color: filter === f ? "white" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading applications…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No {filter === "All" ? "" : filter.toLowerCase() + " "}applications yet</div>
      ) : (
        <AdminTable
          columns={["Applicant", "Amount", "Purpose", "Applied", "Status", "Action"]}
          rows={filtered.map((a) => [
            a.applicantName || "—",
            ugx(a.amount),
            a.purpose,
            fmtDate(a.createdAt),
            <StatusBadge key={a.id + "-s"} status={a.status} />,
            a.status === "pending" ? (
              <div key={a.id + "-act"} style={{ display: "flex", gap: 6 }}>
                <button disabled={busyId === a.id} onClick={(e) => { e.stopPropagation(); decide(a.id, "approved"); }}
                  style={{ padding: "4px 10px", borderRadius: 6, background: "#178654", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: busyId === a.id ? "not-allowed" : "pointer" }}>
                  {busyId === a.id ? "…" : "Approve"}
                </button>
                <button disabled={busyId === a.id} onClick={(e) => { e.stopPropagation(); decide(a.id, "rejected"); }}
                  style={{ padding: "4px 10px", borderRadius: 6, background: "#EF4444", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: busyId === a.id ? "not-allowed" : "pointer" }}>
                  Reject
                </button>
              </div>
            ) : (
              <span key={a.id + "-done"} style={{ fontSize: 11, color: "#94A3B8" }}>{a.decidedAt ? fmtDate(a.decidedAt) : "—"}</span>
            ),
          ])}
        />
      )}
    </AdminLayout>
  );
}

// A3.2
export function AdminActiveLoansListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setApps(applications.filter((a) => ["approved", "active"].includes(a.status))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-active-loans" onNavigate={onNavigate} title="Active Loans">
      <AdminPageHeader title="Active Loans" subtitle={loading ? "Loading…" : `${apps.length} loans currently active`}
        action={<button disabled={loading || apps.length === 0} onClick={() => downloadCsv("kuula-active-loans", ["Customer", "Loan ID", "Amount (UGX)", "Applied", "Status"], apps.map((a) => [a.applicantName || "—", a.id, a.amount, fmtDate(a.createdAt), a.status]))} style={{ padding:"8px 14px",borderRadius:8,background:"white",border:"1px solid #E2E8F0",color:"#374151",fontSize:12,fontWeight:600,cursor: loading || apps.length === 0 ? "default" : "pointer",opacity: loading || apps.length === 0 ? 0.6 : 1,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export CSV</button>}
      />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Active Loans" value={loading ? "…" : String(apps.length)} color="#0B5E3A" icon={<></>} />
        <StatCard label="Total Amount" value={loading ? "…" : `UGX ${(apps.reduce((s, a) => s + a.amount, 0) / 1000000).toFixed(1)}M`} color="#178654" icon={<></>} />
        <StatCard label="Pending Decisions" value={loading ? "…" : String(apps.filter(a => a.status === "pending").length)} color="#F59E0B" icon={<></>} />
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading active loans…</div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No active loans</div>
      ) : (
        <AdminTable
          columns={["Customer", "Loan ID", "Amount", "Applied", "Status"]}
          rows={apps.map((a) => [
            a.applicantName || "—",
            a.id.slice(0, 12),
            ugx(a.amount),
            fmtDate(a.createdAt),
            <StatusBadge key={a.id} status={a.status} />,
          ])}
        />
      )}
    </AdminLayout>
  );
}

// A3.6
export function AdminOverdueLoansListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("contact");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseStatus, setPromiseStatus] = useState("kept");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    if (!token) { setLoading(false); return; }
    api.getCollections(token)
      .then((result) => { setAccounts(result.accounts); setActivities(result.activities); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load overdue accounts"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, [token]);

  async function addActivity() {
    if (!token || !selected || !note.trim()) return;
    try {
      await api.addCollectionActivity(token, selected, { activityType, note:note.trim(), ...(activityType==="promise_to_pay"?{promiseAmount:Number(promiseAmount),promiseDate}: {}), ...(activityType==="promise_update"?{promiseStatus}:{}), ...(activityType==="assignment"?{assignedTo:state.user?.id}: {}) });
      setNote(""); setPromiseAmount(""); setPromiseDate(""); refresh();
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Activity could not be saved"); }
  }

  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Overdue Loans">
      <AdminPageHeader title="Overdue Loans" subtitle={loading ? "Loading…" : `${accounts.length} loans past due date`} />
      {error&&<p role="alert" style={{color:"#991B1B"}}>{error}</p>}
      {accounts.length > 0 && (
        <div style={{ padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16 }}>
          <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>⚠ {accounts.length} loan{accounts.length !== 1 ? "s are" : " is"} overdue. Contact customers immediately.</p>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No overdue loans 🎉</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><AdminTable
          columns={["Customer", "Amount due", "Days past due", "Status"]}
          rows={accounts.map((a) => [
            <button key={String(a.repayment_id)} onClick={()=>setSelected(String(a.repayment_id))}>{String(a.full_name||"—")}</button>,
            ugx(Number(a.total||0)-Number(a.amount_paid||0)),
            String(a.days_past_due||0), <StatusBadge key={String(a.repayment_id)} status="overdue" />,
          ])}/><AdminCard>{!selected?<p>Select an account to record recovery work.</p>:<><h3>Collection activity</h3><select value={activityType} onChange={e=>setActivityType(e.target.value)}><option value="contact">Contact</option><option value="note">Note</option><option value="assignment">Assign to me</option><option value="promise_to_pay">Promise to pay</option><option value="promise_update">Update promise status</option></select>{activityType==="promise_to_pay"&&<div><input aria-label="Promise amount" type="number" min="1" value={promiseAmount} onChange={e=>setPromiseAmount(e.target.value)}/><input aria-label="Promise date" type="date" value={promiseDate} onChange={e=>setPromiseDate(e.target.value)}/></div>}{activityType==="promise_update"&&<select aria-label="Promise status" value={promiseStatus} onChange={e=>setPromiseStatus(e.target.value)}><option value="kept">Kept</option><option value="broken">Broken</option><option value="cancelled">Cancelled</option></select>}<textarea aria-label="Collection note" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/><button onClick={()=>void addActivity()}>Save activity</button><h4>History</h4>{activities.filter(a=>a.repayment_id===selected).map(a=><div key={String(a.id)}><strong>{String(a.activity_type).replaceAll("_"," ")}</strong>{a.promise_status?` (${String(a.promise_status)})`:""} — {String(a.note)}<small> {new Date(String(a.created_at)).toLocaleString()}</small></div>)}</>}</AdminCard></div>
      )}
    </AdminLayout>
  );
}

// A3.9
export function AdminLoanHistoryAllScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setApps(applications.filter((a) => ["paid", "rejected"].includes(a.status))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-loan-history" onNavigate={onNavigate} title="Loan History">
      <AdminPageHeader title="Loan History (All)" subtitle={loading ? "Loading…" : `${apps.length} closed applications`}
        action={<button disabled={loading || apps.length === 0} onClick={() => downloadCsv("kuula-loan-history", ["Customer", "Amount (UGX)", "Purpose", "Date", "Status"], apps.map((a) => [a.applicantName || "—", a.amount, a.purpose, fmtDate(a.createdAt), a.status]))} style={{ padding:"8px 14px",borderRadius:8,background:"white",border:"1px solid #E2E8F0",color:"#374151",fontSize:12,fontWeight:600,cursor: loading || apps.length === 0 ? "default" : "pointer",opacity: loading || apps.length === 0 ? 0.6 : 1,display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export</button>}
      />
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No closed loans yet</div>
      ) : (
        <AdminTable
          columns={["Customer", "Amount", "Purpose", "Date", "Status"]}
          rows={apps.map((a) => [
            a.applicantName || "—",
            ugx(a.amount),
            a.purpose,
            fmtDate(a.createdAt),
            <StatusBadge key={a.id} status={a.status} />,
          ])}
        />
      )}
    </AdminLayout>
  );
}
