/**
 * A8.1-A8.5 Reports | A9.1-A9.10 Settings | A10.1-A10.4 Support
 */

import React, { useState, useEffect } from "react";
import { Download, Send, Plus, Trash2, Check, Pencil, RotateCcw } from "lucide-react";
import { AdminLayout, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import type { StaffMember } from "../../api/types";
import type { InvestorReport } from "../../api/types-compat";
import { formatUGX } from "../../lib/export";
import { exportInvestorReportPdf, exportInvestorReportExcel, exportInvestorReportWord } from "../../lib/investorReport";

interface Props { onNavigate: (s: string) => void; }

// Shared loader for the live investor report (all figures computed from Postgres).
function useInvestorReport(range?: { start?: string; end?: string }) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [report, setReport] = useState<InvestorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.getInvestorReport(token, range)
      .then((r) => setReport(r))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token, range?.start, range?.end]);
  return { report, loading, error };
}

type ReportPeriod = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";
function selectedRange(period: ReportPeriod, customStart: string, customEnd: string) {
  if (period === "all") return {};
  if (period === "custom") return { start: customStart || undefined, end: customEnd || undefined };
  const now = new Date(); const end = now.toISOString().slice(0, 10); const start = new Date(now);
  if (period === "today") return { start: end, end };
  if (period === "week") start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  if (period === "quarter") { start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1); }
  if (period === "year") start.setMonth(0, 1);
  return { start: start.toISOString().slice(0, 10), end };
}

// A8.1
export function AdminReportsDashboardScreen({ onNavigate }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "docx">("pdf");
  const range = selectedRange(period, customStart, customEnd);
  const invalidRange = Boolean(range.start && range.end && range.start > range.end);
  const { report, loading, error } = useInvestorReport(invalidRange ? { start: "invalid", end: "invalid" } : range);
  const generate = async () => {
    if (!report || invalidRange) return;
    if (format === "pdf") await exportInvestorReportPdf(report);
    else if (format === "xlsx") exportInvestorReportExcel(report);
    else await exportInvestorReportWord(report);
  };
  const chart = (report?.monthly ?? []).map((m) => ({ m: m.month, disbursed: Math.round(m.disbursed / 1_000_000), collected: Math.round(m.collected / 1_000_000) }));
  return (
    <AdminLayout activeScreen="admin-reports" onNavigate={onNavigate} title="Financial Reports">
      <AdminPageHeader title="Financial Reports" subtitle="Live financial performance from Kuula's ledger" />
      <AdminCard style={{ marginBottom: 16 }}>
        <div style={{ display:"flex",gap:10,alignItems:"end",flexWrap:"wrap" }}>
          <label style={{ fontSize:12,fontWeight:600 }}>Period<select value={period} onChange={event=>setPeriod(event.target.value as ReportPeriod)} style={{ display:"block",marginTop:5,height:38,border:"1px solid #CBD5E1",borderRadius:8,padding:"0 10px" }}>{[["today","Today"],["week","This week"],["month","This month"],["quarter","This quarter"],["year","This year"],["all","All time"],["custom","Custom range"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {period === "custom" && <><label style={{ fontSize:12,fontWeight:600 }}>Start<input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{ display:"block",marginTop:5,height:36,border:"1px solid #CBD5E1",borderRadius:8,padding:"0 8px" }}/></label><label style={{ fontSize:12,fontWeight:600 }}>End<input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{ display:"block",marginTop:5,height:36,border:"1px solid #CBD5E1",borderRadius:8,padding:"0 8px" }}/></label></>}
          <label style={{ fontSize:12,fontWeight:600 }}>Format<select value={format} onChange={event=>setFormat(event.target.value as typeof format)} style={{ display:"block",marginTop:5,height:38,border:"1px solid #CBD5E1",borderRadius:8,padding:"0 10px" }}><option value="pdf">PDF</option><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option></select></label>
          <button onClick={()=>void generate()} disabled={loading || !report || invalidRange} style={{ height:38,padding:"0 16px",border:0,borderRadius:8,background:"#0B5E3A",color:"white",fontWeight:700,cursor:"pointer" }}><Download size={14} style={{ verticalAlign:"middle",marginRight:6 }}/>Generate Report</button>
        </div>
        {invalidRange && <p role="alert" style={{ color:"#B91C1C",fontSize:12 }}>Start date must be on or before end date.</p>}
      </AdminCard>
      {loading ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Loading live figures…</div>
      ) : error || !report ? (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#9CA3AF",fontSize:13 }}>Reports are unavailable right now.</div>
      ) : (
      <>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Collected" value={formatUGX(report.revenue.totalCollected)} color="#178654" icon={<></>}/>
        <StatCard label="Principal Disbursed" value={formatUGX(report.loans.disbursedPrincipal)} color="#0B5E3A" icon={<></>}/>
        <StatCard label="Realized Interest" value={formatUGX(report.revenue.realizedInterest)} color="#8B5CF6" icon={<></>}/>
        <StatCard label="Default Rate" value={`${report.ratios.defaultRatePct}%`} color="#EF4444" icon={<></>}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Monthly Disbursed vs Collected (UGX Millions)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
              <XAxis dataKey="m" tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11,fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ borderRadius:8,border:"none",boxShadow:"0 4px 12px rgba(0,0,0,.1)" }}/>
              <Bar key="disbursed" dataKey="disbursed" fill="#0B5E3A" radius={[4,4,0,0]} name="Disbursed (M)"/>
              <Bar key="collected" dataKey="collected" fill="#178654" radius={[4,4,0,0]} name="Collected (M)"/>
            </BarChart>
          </ResponsiveContainer>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 14px" }}>Performance Ratios</h3>
          {[["Repayment Rate",`${report.ratios.repaymentRatePct}%`,"#178654"],["Default Rate",`${report.ratios.defaultRatePct}%`,"#EF4444"],["Portfolio at Risk",`${report.ratios.parPct}%`,"#F59E0B"]].map(([l,v,c])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span>
              <span style={{ fontSize:13,fontWeight:800,color:c as string }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
      </>
      )}
    </AdminLayout>
  );
}

// A9.1
export function AdminNotifTemplatesScreen({ onNavigate }: Props) {
  const TEMPLATES = ["Loan Approved SMS","Loan Rejected SMS","Payment Due Reminder","Overdue Loan Alert","Welcome Message","OTP Verification"];
  const [active, setActive] = useState(0);
  const [body, setBody] = useState("Dear {{name}}, your loan of {{amount}} has been approved and disbursed to {{method}}. Due date: {{due_date}}. Ref: {{loan_ref}}. Kuula Microfinance.");
  return (
    <AdminLayout activeScreen="admin-notif-templates" onNavigate={onNavigate} title="Notification Templates">
      <AdminPageHeader title="Notification Templates" subtitle="Edit SMS and email message templates"/>
      <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
          {TEMPLATES.map((t,i)=>(
            <button key={t} onClick={()=>setActive(i)} style={{ padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"left",fontSize:12,fontWeight:active===i?700:500,background:active===i?"#F3FAF7":"white",color:active===i?"#0B5E3A":"#374151",boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>{t}</button>
          ))}
        </div>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 4px" }}>{TEMPLATES[active]}</h3>
          <p style={{ fontSize:11,color:"#94A3B8",margin:"0 0 16px" }}>Available variables: {"{{name}}, {{amount}}, {{method}}, {{due_date}}, {{loan_ref}}"}</p>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Message Body</label>
          <textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={5} style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8 }}>
            <span style={{ fontSize:11,color:"#94A3B8" }}>{body.length} / 160 chars</span>
            <div style={{ display:"flex",gap:8 }}>
              <button style={{ padding:"8px 14px",borderRadius:8,background:"#F0FDF4",color:"#178654",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Send Test</button>
              <button style={{ padding:"8px 14px",borderRadius:8,background:"#0B5E3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Save Template</button>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// A9.8
const INVITABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: "administrator", label: "Administrator" },
  { value: "loan_officer", label: "Loan Officer" },
  { value: "credit_manager", label: "Credit Manager" },
  { value: "final_approver", label: "Final Approver" },
  { value: "kyc_officer", label: "KYC / Compliance Officer" },
  { value: "finance", label: "Finance / Reconciliation" },
  { value: "collections", label: "Collections Officer" },
  { value: "support", label: "Customer Support" },
];

const STAFF_ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  ...Object.fromEntries(INVITABLE_ROLES.map((r) => [r.value, r.label])),
  admin: "Administrator",
  manager: "Manager",
  officer: "Officer",
};

export function AdminStaffManagementScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("loan_officer");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("loan_officer");

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const r = await api.listStaff(token);
      setStaff(r.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff accounts.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [token]);

  const invite = async () => {
    if (!token) return;
    setError(""); setNotice("");
    if (inviteName.trim().length < 2) { setError("Enter the staff member's full name."); return; }
    if (!invitePhone.trim()) { setError("Enter the staff member's phone number."); return; }
    setInviting(true);
    try {
      await api.inviteStaff(token, { fullName: inviteName.trim(), phone: invitePhone.trim(), role: inviteRole });
      setNotice(`Invitation sent to ${invitePhone.trim()}. They activate it from the staff sign-in screen.`);
      setInviteName(""); setInvitePhone(""); setInviteRole("loan_officer"); setShowInvite(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invitation.");
    } finally { setInviting(false); }
  };

  const deactivate = async (member: StaffMember) => {
    if (!token) return;
    if (!window.confirm(`Deactivate ${member.fullName}? Their sessions end immediately.`)) return;
    setBusyId(member.id); setError(""); setNotice("");
    try {
      await api.deactivateStaff(token, member.id);
      setNotice(`${member.fullName} has been deactivated.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deactivate this account.");
    } finally { setBusyId(null); }
  };

  const beginEdit = (member: StaffMember) => { setEditing(member); setEditName(member.fullName); setEditEmail(member.email || ""); setEditRole(member.role); };
  const saveEdit = async () => {
    if (!token || !editing) return;
    setBusyId(editing.id); setError(""); setNotice("");
    try { await api.updateStaff(token, editing.id, { fullName: editName.trim(), email: editEmail.trim(), role: editRole }); setNotice(`${editName.trim()} has been updated.`); setEditing(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update this account."); }
    finally { setBusyId(null); }
  };
  const reactivate = async (member: StaffMember) => {
    if (!token || !window.confirm(`Reactivate ${member.fullName}? They will regain staff sign-in access.`)) return;
    setBusyId(member.id); setError(""); setNotice("");
    try { await api.reactivateStaff(token, member.id); setNotice(`${member.fullName} has been reactivated.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reactivate this account."); }
    finally { setBusyId(null); }
  };

  const statusStyle = (status: StaffMember["status"]) => status === "active"
    ? { color: "#178654", background: "#F0FDF4" }
    : status === "invited"
      ? { color: "#9B7410", background: "#FFF7D8" }
      : { color: "#9CA3AF", background: "#F3F4F6" };

  return (
    <AdminLayout activeScreen="admin-staff" onNavigate={onNavigate} title="Staff Management">
      <AdminPageHeader title="Staff Management" subtitle={`${staff.length} staff account${staff.length === 1 ? "" : "s"}`}
        action={<button onClick={() => setShowInvite((v) => !v)} style={{ padding:"8px 14px",borderRadius:8,background:"#0B5E3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/>Invite Staff</button>}
      />
      {showInvite && (
        <AdminCard style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 6px" }}>Invite a staff member</h3>
          <p style={{ fontSize:12,color:"#64748B",margin:"0 0 14px" }}>They receive an SMS activation code on this phone number and choose their own password. The phone number becomes their sign-in.</p>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}>
            <div>
              <label style={{ display:"block",fontSize:11,fontWeight:700,color:"#425149",marginBottom:5 }}>Full name</label>
              <input value={inviteName} onChange={(e)=>setInviteName(e.target.value)} placeholder="e.g. Alice Kabanda" style={{ width:"100%",height:42,padding:"0 12px",borderRadius:10,border:"1px solid #D5DED8" }}/>
            </div>
            <div>
              <label style={{ display:"block",fontSize:11,fontWeight:700,color:"#425149",marginBottom:5 }}>Phone number</label>
              <input value={invitePhone} onChange={(e)=>setInvitePhone(e.target.value)} type="tel" placeholder="+256 7XX XXX XXX" style={{ width:"100%",height:42,padding:"0 12px",borderRadius:10,border:"1px solid #D5DED8" }}/>
            </div>
            <div>
              <label style={{ display:"block",fontSize:11,fontWeight:700,color:"#425149",marginBottom:5 }}>Role</label>
              <select value={inviteRole} onChange={(e)=>setInviteRole(e.target.value)} style={{ width:"100%",height:42,padding:"0 12px",borderRadius:10,border:"1px solid #D5DED8",background:"white" }}>
                {INVITABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={invite} disabled={inviting} style={{ marginTop:14,padding:"10px 18px",borderRadius:10,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>
            {inviting ? "Sending invitation…" : "Send SMS Invitation"}
          </button>
        </AdminCard>
      )}
      {editing && <AdminCard style={{ marginBottom:14 }}><h3 style={{ marginTop:0 }}>Edit staff profile</h3><div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}><input aria-label="Staff full name" value={editName} onChange={e=>setEditName(e.target.value)} /><input aria-label="Staff email" type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} /><select aria-label="Staff role" value={editRole} onChange={e=>setEditRole(e.target.value)}>{INVITABLE_ROLES.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></div><div style={{ display:"flex",gap:8,marginTop:12 }}><button onClick={()=>void saveEdit()} disabled={busyId===editing.id}>Save changes</button><button onClick={()=>setEditing(null)}>Cancel</button></div></AdminCard>}
      {notice && <p style={{ fontSize:12,color:"#15864E",margin:"0 0 12px" }}>{notice}</p>}
      {error && <p style={{ fontSize:12,color:"#DC4C4C",margin:"0 0 12px" }}>{error}</p>}
      {loading ? (
        <AdminCard><p style={{ fontSize:13,color:"#64748B",margin:0 }}>Loading staff accounts…</p></AdminCard>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {staff.map((s)=>(
            <AdminCard key={s.id}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{(s.fullName || "KU").split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}</span>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{s.fullName}</p>
                  <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>{STAFF_ROLE_LABELS[s.role] ?? s.role} · {s.phone || s.email || "—"}</p>
                  <p style={{ fontSize:11,color:"#94A3B8",margin:"2px 0 0" }}>Added {new Date(s.createdAt).toLocaleDateString("en-UG", { month:"short", day:"numeric", year:"numeric" })}</p>
                </div>
                <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                  <span style={{ fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,textTransform:"capitalize",...statusStyle(s.status) }}>{s.status}</span>
                  {s.role !== "super_admin" && <button onClick={()=>beginEdit(s)} disabled={busyId===s.id} style={{ padding:"6px 10px",borderRadius:8,border:"1px solid #CBD5E1",background:"white",cursor:"pointer",display:"flex",gap:5 }}><Pencil size={12}/>Edit</button>}
                  {s.status === "deactivated" && s.role !== "super_admin" && <button onClick={()=>void reactivate(s)} disabled={busyId===s.id} style={{ padding:"6px 10px",borderRadius:8,border:0,background:"#F0FDF4",color:"#15803D",cursor:"pointer",display:"flex",gap:5 }}><RotateCcw size={12}/>Reactivate</button>}
                  {s.status !== "deactivated" && s.role !== "super_admin" && s.id !== state.user?.id && (
                    <button onClick={() => void deactivate(s)} disabled={busyId === s.id} style={{ padding:"6px 12px",borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                      <Trash2 size={12}/>{busyId === s.id ? "Working…" : "Deactivate"}
                    </button>
                  )}
                </div>
              </div>
            </AdminCard>
          ))}
          {staff.length === 0 && <AdminCard><p style={{ fontSize:13,color:"#64748B",margin:0 }}>No staff accounts yet. Invite your team by phone number.</p></AdminCard>}
        </div>
      )}
    </AdminLayout>
  );
}

// A9.9
export function AdminBulkEmailScreen({ onNavigate }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <AdminLayout activeScreen="admin-bulk-email" onNavigate={onNavigate} title="Bulk Email">
      <AdminPageHeader title="Bulk Email" subtitle="Send email campaigns to customers"/>
      <div style={{ maxWidth:700 }}>
        <AdminCard>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Subject Line</label>
            <input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="e.g. Important update from Kuula Microfinance" style={{ width:"100%",height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:14,color:"#374151",background:"#F9FAFB",outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Email Body</label>
            <textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={10} placeholder="Compose your email here. Use {{name}}, {{loan_id}}, {{amount}} for personalization..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"12px 14px",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none" }}/>
          </div>
          <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
            {["All Customers","Active Borrowers","Overdue Customers"].map((a)=>(
              <button key={a} style={{ padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:"#F3F4F6",color:"#6B7280" }}>{a}</button>
            ))}
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
              <Send size={16}/> Send Email Campaign
            </button>
            <button style={{ flex:1,height:46,borderRadius:10,background:"#F3F4F6",color:"#374151",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Draft</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
