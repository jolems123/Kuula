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
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: filter === f ? "#FF6B35" : "white", color: filter === f ? "white" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
                  style={{ padding: "4px 10px", borderRadius: 6, background: "#10B981", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: busyId === a.id ? "not-allowed" : "pointer" }}>
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
          onRowClick={() => onNavigate("admin-loan-app-detail")}
        />
      )}
    </AdminLayout>
  );
}

// A3.2
export function AdminLoanAppDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Application Detail">
      <AdminPageHeader title="Loan Application Detail"
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onNavigate("admin-loan-approval")} style={{ padding: "8px 16px", borderRadius: 8, background: "#10B981", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Approve</button>
          <button onClick={() => onNavigate("admin-loan-rejection")} style={{ padding: "8px 16px", borderRadius: 8, background: "#EF4444", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reject</button>
        </div>}
      />
      <div style={{ padding: "24px", textAlign: "center", color: "#9CA3AF" }}>
        <p style={{ fontSize: 14 }}>Select an application from the list to view its details.</p>
      </div>
    </AdminLayout>
  );
}

// A3.3
export function AdminLoanApprovalScreen({ onNavigate }: Props) {
  const [notes, setNotes] = useState("");
  return (
    <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Approve Loan">
      <AdminPageHeader title="Approve Loan Application" subtitle="Review and confirm the disbursement" />
      <div style={{ maxWidth: 600 }}>
        <AdminCard style={{ marginBottom: 16 }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
            <div style={{ width:48,height:48,borderRadius:24,background:"#F0FDF4",border:"2px solid #A7F3D0",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <CheckCircle size={28} color="#10B981" />
            </div>
            <div>
              <p style={{ fontSize:16,fontWeight:800,color:"#065F46",margin:0 }}>Approve Loan</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:"2px 0 0" }}>This sends the customer a loan offer. Funds are only disbursed after they accept the agreement in-app.</p>
            </div>
          </div>
          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Approval Notes (optional)</label>
            <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Add any notes for this approval..." rows={3} style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }} />
          </div>
        </AdminCard>
        <div style={{ display:"flex",gap:12 }}>
          <button onClick={()=>onNavigate("admin-loan-apps")} style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#10B981,#059669)",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>✓ Confirm Approval</button>
          <button onClick={()=>onNavigate("admin-loan-apps")} style={{ flex:1,height:46,borderRadius:10,background:"#F1F5F9",color:"#64748B",fontSize:15,fontWeight:600,border:"none",cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </AdminLayout>
  );
}

// A3.4
export function AdminLoanRejectionScreen({ onNavigate }: Props) {
  const [reason, setReason] = useState("insufficient_score");
  const [notes, setNotes] = useState("");
  const REASONS = [
    { id:"insufficient_score", label:"Credit score too low (<600)" },
    { id:"unverified_id", label:"ID not verified" },
    { id:"exceeded_limit", label:"Exceeds credit limit" },
    { id:"incomplete_info", label:"Incomplete application" },
    { id:"high_risk", label:"High risk profile" },
    { id:"other", label:"Other reason" },
  ];
  return (
    <AdminLayout activeScreen="admin-loan-apps" onNavigate={onNavigate} title="Reject Application">
      <AdminPageHeader title="Reject Loan Application" subtitle="Provide a reason for the rejection" />
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:16 }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
            <div style={{ width:48,height:48,borderRadius:24,background:"#FEF2F2",border:"2px solid #FECACA",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <XCircle size={28} color="#EF4444" />
            </div>
            <div>
              <p style={{ fontSize:16,fontWeight:800,color:"#991B1B",margin:0 }}>Reject Application</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:"2px 0 0" }}>The applicant will be notified via SMS with the reason.</p>
            </div>
          </div>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:10 }}>Rejection Reason *</label>
          {REASONS.map((r)=>(
            <button key={r.id} onClick={()=>setReason(r.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,border:`2px solid ${reason===r.id?"#EF4444":"#E5E7EB"}`,background:reason===r.id?"#FEF2F2":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:18,height:18,borderRadius:9,border:`2px solid ${reason===r.id?"#EF4444":"#D1D5DB"}`,background:reason===r.id?"#EF4444":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {reason===r.id&&<div style={{ width:7,height:7,borderRadius:4,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,fontWeight:reason===r.id?700:400,color:reason===r.id?"#991B1B":"#374151" }}>{r.label}</span>
            </button>
          ))}
          <div style={{ marginTop:12 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Additional Notes</label>
            <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3} placeholder="Provide more context for the rejection..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }} />
          </div>
        </AdminCard>
        <div style={{ display:"flex",gap:12 }}>
          <button onClick={()=>onNavigate("admin-loan-apps")} style={{ flex:1,height:46,borderRadius:10,background:"#EF4444",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>Confirm Rejection</button>
          <button onClick={()=>onNavigate("admin-loan-apps")} style={{ flex:1,height:46,borderRadius:10,background:"#F1F5F9",color:"#64748B",fontSize:15,fontWeight:600,border:"none",cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </AdminLayout>
  );
}

// A3.5 — Active loans from Supabase
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
        <StatCard label="Active Loans" value={loading ? "…" : String(apps.length)} color="#FF6B35" icon={<></>} />
        <StatCard label="Total Amount" value={loading ? "…" : `UGX ${(apps.reduce((s, a) => s + a.amount, 0) / 1000000).toFixed(1)}M`} color="#10B981" icon={<></>} />
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
          onRowClick={() => onNavigate("admin-active-loan-detail")}
        />
      )}
    </AdminLayout>
  );
}

// A3.6
export function AdminActiveLoanDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-active-loans" onNavigate={onNavigate} title="Active Loan Detail">
      <AdminPageHeader title="Active Loan Detail" subtitle="Select a loan from the list to see details" />
      <div style={{ padding: "24px", textAlign: "center", color: "#9CA3AF" }}>
        <p style={{ fontSize: 14 }}>Loan detail view — navigate from the active loans list.</p>
      </div>
    </AdminLayout>
  );
}

// A3.7
export function AdminRepaymentTrackingScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);

  useEffect(() => {
    if (!token) return;
    api.getApplications(token).then(({ applications }) => setApps(applications)).catch(() => {});
  }, [token]);

  const byMonth: Record<string, number> = {};
  for (const a of apps) {
    const m = new Date(a.createdAt).toLocaleString("en-US", { month: "short" });
    byMonth[m] = (byMonth[m] ?? 0) + 1;
  }
  const chartData = Object.entries(byMonth).map(([month, loans]) => ({ month, loans }));

  return (
    <AdminLayout activeScreen="admin-active-loans" onNavigate={onNavigate} title="Repayment Tracking">
      <AdminPageHeader title="Repayment Tracking" subtitle="Loan application volume by month" />
      <AdminCard style={{ marginBottom:20 }}>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Monthly Application Volume</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData.length > 0 ? chartData : [{ month: "—", loans: 0 }]}>
            <XAxis dataKey="month" tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ borderRadius:8,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,.1)" }}/>
            <Bar dataKey="loans" fill="#FF6B35" radius={[4,4,0,0]} name="Applications"/>
          </BarChart>
        </ResponsiveContainer>
      </AdminCard>
    </AdminLayout>
  );
}

// A3.8
export function AdminOverdueLoansListScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getApplications(token)
      .then(({ applications }) => setApps(applications.filter((a) => a.status === "overdue")))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Overdue Loans">
      <AdminPageHeader title="Overdue Loans" subtitle={loading ? "Loading…" : `${apps.length} loans past due date`}
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Send Bulk Reminder</button>}
      />
      {apps.length > 0 && (
        <div style={{ padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16 }}>
          <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>⚠ {apps.length} loan{apps.length !== 1 ? "s are" : " is"} overdue. Contact customers immediately.</p>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>No overdue loans 🎉</div>
      ) : (
        <AdminTable
          columns={["Customer", "Amount", "Applied", "Status"]}
          rows={apps.map((a) => [
            a.applicantName || "—",
            ugx(a.amount),
            fmtDate(a.createdAt),
            <StatusBadge key={a.id} status={a.status} />,
          ])}
          onRowClick={() => onNavigate("admin-overdue-detail")}
        />
      )}
    </AdminLayout>
  );
}

// A3.9
export function AdminOverdueLoanDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Overdue Loan">
      <AdminPageHeader title="Overdue Loan Detail" />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px",color:"#991B1B" }}>Select an overdue loan to view details</h3>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Contact Customer</h3>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {[
              { Icon:Phone,label:"Call customer",color:"#10B981",bg:"#F0FDF4" },
              { Icon:MessageSquare,label:"Send SMS Reminder",color:"#FF6B35",bg:"#FFF0E8" },
            ].map(({ Icon,label,color,bg })=>(
              <button key={label} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:bg,border:"none",cursor:"pointer",textAlign:"left" }}>
                <Icon size={18} color={color}/><span style={{ fontSize:13,fontWeight:600,color }}>{label}</span>
              </button>
            ))}
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A3.10
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
          onRowClick={() => onNavigate("admin-active-loan-detail")}
        />
      )}
    </AdminLayout>
  );
}
