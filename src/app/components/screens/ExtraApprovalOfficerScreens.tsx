/**
 * Group 1 — Loan Approval Workflow + Officer Tracking (screens 1–18)
 * Admin: 1–12, 14–18  |  Customer: 13
 */

import React, { useState } from "react";
import { Check, X, ArrowRight, Phone, Mail, Clock, Star, AlertTriangle, ChevronRight, Plus, RefreshCw, User } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

// ─── 1. Loan Approval Workflow ───────────────────────────────────────────────
export function AdminApprovalWorkflowScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const stages = [
    { level: "Junior Officer",    limit: "UGX 50,000 – 500,000",  auto: true,  sla: "30 min",  color: "#10B981" },
    { level: "Senior Officer",    limit: "UGX 500,001 – 1,000,000", auto: false, sla: "2 hours", color: "#0D5C3A" },
    { level: "Branch Manager",   limit: "UGX 1,000,001 – 2,000,000", auto: false, sla: "4 hours", color: "#8B5CF6" },
    { level: "Credit Committee", limit: "Above UGX 2,000,000",    auto: false, sla: "24 hours", color: "#EF4444" },
  ];
  return (
    <AdminLayout activeScreen="admin-approval-workflow" onNavigate={onNavigate} title="Approval Workflow">
      <AdminPageHeader title="Loan Approval Workflow" subtitle="Configure the multi-level approval chain"
        action={<button onClick={() => onNavigate("admin-approval-levels")} style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Edit Levels</button>}
      />
      <div style={{ display:"flex",flexDirection:"column",gap:14,marginBottom:24 }}>
        {stages.map((s, i) => (
          <AdminCard key={s.level}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:40,height:40,borderRadius:12,background:s.color+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:s.color }}>
                {i + 1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{s.level}</p>
                  {s.auto && <span style={{ fontSize:10,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"2px 8px",borderRadius:20 }}>Auto-approve</span>}
                </div>
                <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>{s.limit} · SLA: {s.sla}</p>
              </div>
              {i < stages.length - 1 && <ArrowRight size={18} color="#D1D5DB" />}
            </div>
          </AdminCard>
        ))}
      </div>
      <div style={{ display:"flex",gap:14 }}>
        <StatCard label="Avg Approval Time" value="2.3 hrs" sub="All levels combined" color="#0D5C3A" icon={<Clock size={18} color="#0D5C3A"/>}/>
        <StatCard label="Auto-Approved Today" value="22" sub="79% of approved" color="#10B981" icon={<Check size={18} color="#10B981"/>}/>
        <StatCard label="Escalated Today" value="4" sub="Sent to next level" color="#F59E0B" icon={<ArrowRight size={18} color="#F59E0B"/>}/>
        <StatCard label="Rejected Today" value="6" sub="At any level" color="#EF4444" icon={<X size={18} color="#EF4444"/>}/>
      </div>
    </AdminLayout>
  );
}

// ─── 2. Approval Level Settings ──────────────────────────────────────────────
export function AdminApprovalLevelsScreen({ onNavigate }: Props) {
  const [levels, setLevels] = useState([
    { name:"Junior Officer",   min:"50000",  max:"500000",  auto:true,  sla:"30" },
    { name:"Senior Officer",   min:"500001", max:"1000000", auto:false, sla:"120" },
    { name:"Branch Manager",  min:"1000001",max:"2000000", auto:false, sla:"240" },
  ]);
  return (
    <AdminLayout activeScreen="admin-approval-levels" onNavigate={onNavigate} title="Approval Level Settings">
      <AdminPageHeader title="Approval Level Settings" subtitle="Define who approves which loan amounts"/>
      <div style={{ maxWidth:700 }}>
        {levels.map((l, i) => (
          <AdminCard key={i} style={{ marginBottom:14 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <h3 style={{ fontSize:14,fontWeight:700,margin:0,color:"#0F172A" }}>Level {i+1}: {l.name}</h3>
              <button style={{ padding:"4px 10px",borderRadius:6,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Remove</button>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12 }}>
              {[
                { label:"Min Amount (UGX)", val:l.min },
                { label:"Max Amount (UGX)", val:l.max },
                { label:"SLA (minutes)", val:l.sla },
              ].map(({ label, val }) => (
                <div key={label}>
                  <label style={{ fontSize:11,fontWeight:600,color:"#64748B",display:"block",marginBottom:5 }}>{label}</label>
                  <input defaultValue={val} style={{ width:"100%",height:38,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 10px",fontSize:13,color:"#374151",outline:"none",boxSizing:"border-box" as "border-box" }}/>
                </div>
              ))}
              <div>
                <label style={{ fontSize:11,fontWeight:600,color:"#64748B",display:"block",marginBottom:5 }}>Auto-Approve</label>
                <button onClick={() => setLevels(ls => ls.map((x,j) => j===i ? {...x,auto:!x.auto} : x))} style={{ width:"100%",height:38,borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:l.auto?"#10B981":"#F3F4F6",color:l.auto?"white":"#6B7280" }}>
                  {l.auto ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </AdminCard>
        ))}
        <button style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 16px",borderRadius:12,background:"white",border:"2px dashed #D1D5DB",color:"#64748B",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%",justifyContent:"center",marginBottom:16 }}>
          <Plus size={16}/> Add Approval Level
        </button>
        <button style={{ width:"100%",height:46,borderRadius:12,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>
          Save Level Settings
        </button>
      </div>
    </AdminLayout>
  );
}

// ─── 3. Officer Assignment ────────────────────────────────────────────────────
export function AdminOfficerAssignmentScreen({ onNavigate }: Props) {
  const [assigned, setAssigned] = useState<string | null>(null);
  const officers = [
    { name:"Alice Kabanda",  role:"Senior Loan Officer", load:12, available:true },
    { name:"Brian Ssali",    role:"Junior Officer",       load:18, available:true },
    { name:"Christine Ajok", role:"Senior Loan Officer", load:20, available:false },
    { name:"Daniel Muwonge",role:"Junior Officer",       load:8,  available:true },
  ];
  return (
    <AdminLayout activeScreen="admin-officer-assignment" onNavigate={onNavigate} title="Officer Assignment">
      <AdminPageHeader title="Assign Loan Officer" subtitle="KUL-2026-04821 · Amara Nakato · UGX 500,000"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:16 }}>
          <p style={{ fontSize:13,fontWeight:600,color:"#374151",marginBottom:12 }}>Select an available officer:</p>
          {officers.map((o) => (
            <button key={o.name} onClick={() => o.available && setAssigned(o.name)} style={{ width:"100%",display:"flex",alignItems:"center",gap:14,padding:"12px 14px",borderRadius:12,border:`2px solid ${assigned===o.name?"#0D5C3A":"#E5E7EB"}`,background:assigned===o.name?"#ECF5F0":o.available?"white":"#F8FAFC",cursor:o.available?"pointer":"not-allowed",marginBottom:8,textAlign:"left",opacity:o.available?1:0.5 }}>
              <div style={{ width:40,height:40,borderRadius:20,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <span style={{ fontSize:14,fontWeight:700,color:"white" }}>{o.name.split(" ").map(n=>n[0]).join("")}</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13,fontWeight:700,color:"#0F172A",margin:0 }}>{o.name}</p>
                <p style={{ fontSize:11,color:"#64748B",margin:"2px 0 0" }}>{o.role} · {o.load} active loans</p>
              </div>
              <span style={{ fontSize:10,fontWeight:700,color:o.available?"#10B981":"#EF4444",background:o.available?"#F0FDF4":"#FEF2F2",padding:"3px 10px",borderRadius:20 }}>{o.available?"Available":"Busy"}</span>
            </button>
          ))}
        </AdminCard>
        <button onClick={() => { if (assigned) onNavigate("admin-loan-app-detail"); }} style={{ width:"100%",height:46,borderRadius:12,background:assigned?"linear-gradient(135deg,#0D5C3A,#0A4A2E)":"#E5E7EB",color:assigned?"white":"#9CA3AF",border:"none",fontSize:14,fontWeight:700,cursor:assigned?"pointer":"not-allowed" }}>
          Assign to {assigned ?? "Selected Officer"}
        </button>
      </div>
    </AdminLayout>
  );
}

// ─── 4. Officer Dashboard ─────────────────────────────────────────────────────
export function AdminOfficerDashboardScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-officer-dashboard" onNavigate={onNavigate} title="Officer Dashboard">
      <AdminPageHeader title="Officer Dashboard — Alice Kabanda" subtitle="Senior Loan Officer · Today: Jun 11, 2026"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="My Pending" value="12" color="#F59E0B" icon={<Clock size={18} color="#F59E0B"/>}/>
        <StatCard label="Approved Today" value="8" color="#10B981" icon={<Check size={18} color="#10B981"/>}/>
        <StatCard label="Rejected Today" value="2" color="#EF4444" icon={<X size={18} color="#EF4444"/>}/>
        <StatCard label="Avg Decision Time" value="18 min" color="#0D5C3A" icon={<Clock size={18} color="#0D5C3A"/>}/>
      </div>
      <AdminCard style={{ marginBottom:16 }}>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Pending Loans — My Queue</h3>
        <AdminTable
          columns={["Loan ID","Customer","Amount","Purpose","Applied","Priority"]}
          rows={[
            ["KUL-04821","Amara Nakato","UGX 500,000","Business","09:41 AM",<StatusBadge status="high"/>],
            ["KUL-04822","David Ochieng","UGX 300,000","Medical","10:15 AM",<StatusBadge status="medium"/>],
            ["KUL-04823","Sarah Akello","UGX 750,000","School Fees","11:02 AM",<StatusBadge status="low"/>],
          ]}
          onRowClick={() => onNavigate("admin-loan-app-detail")}
        />
      </AdminCard>
    </AdminLayout>
  );
}

// ─── 5. Loan Follow-up Reminder ───────────────────────────────────────────────
export function AdminFollowupReminderScreen({ onNavigate }: Props) {
  const [date, setDate] = useState("2026-06-15");
  const [time, setTime] = useState("10:00");
  const [type, setType] = useState("call");
  const [note, setNote] = useState("");
  return (
    <AdminLayout activeScreen="admin-followup-reminder" onNavigate={onNavigate} title="Follow-up Reminder">
      <AdminPageHeader title="Set Follow-up Reminder" subtitle="KUL-2026-04821 · Amara Nakato"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard>
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div style={{ display:"flex",gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Date</label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Time</label>
                <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Follow-up Type</label>
              <div style={{ display:"flex",gap:8 }}>
                {[{id:"call",label:"📞 Phone Call"},{id:"sms",label:"📱 SMS"},{id:"email",label:"📧 Email"},{id:"visit",label:"🚶 Field Visit"}].map(t=>(
                  <button key={t.id} onClick={()=>setType(t.id)} style={{ flex:1,padding:"8px 6px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:type===t.id?"#0D5C3A":"#F3F4F6",color:type===t.id?"white":"#6B7280" }}>{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Notes</label>
              <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="What to discuss during follow-up..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
            </div>
            <button style={{ height:46,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Set Reminder</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 6. Approval History ──────────────────────────────────────────────────────
export function AdminApprovalHistoryScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-approval-history" onNavigate={onNavigate} title="Approval History">
      <AdminPageHeader title="Approval History — KUL-2026-04821" subtitle="All decisions made on this loan application"/>
      <div style={{ position:"relative",paddingLeft:32 }}>
        {[
          { time:"09:41 AM",action:"Application submitted by Amara Nakato",actor:"Customer (App)",status:"info" },
          { time:"09:42 AM",action:"Auto-assigned to Alice Kabanda (Junior Officer)",actor:"System",status:"info" },
          { time:"09:43 AM",action:"Credit score check passed (742) — eligible",actor:"System (Auto)",status:"success" },
          { time:"09:44 AM",action:"Approved by Alice Kabanda — within UGX 500K limit",actor:"Alice Kabanda",status:"success" },
          { time:"09:45 AM",action:"Funds disbursed to MTN MoMo +256 770 123 456",actor:"System",status:"success" },
        ].map((e,i)=>(
          <div key={i} style={{ position:"relative",paddingLeft:20,marginBottom:20 }}>
            <div style={{ position:"absolute",left:-4,top:4,width:12,height:12,borderRadius:6,background:e.status==="success"?"#10B981":"#0D5C3A",border:"2px solid white",boxShadow:"0 0 0 2px #E2E8F0" }}/>
            {i<4 && <div style={{ position:"absolute",left:1,top:16,width:2,height:36,background:"#E2E8F0" }}/>}
            <div style={{ background:"white",borderRadius:10,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1px solid #F1F5F9" }}>
              <p style={{ fontSize:13,fontWeight:600,color:"#0F172A",margin:0 }}>{e.action}</p>
              <div style={{ display:"flex",gap:12,marginTop:4 }}>
                <span style={{ fontSize:11,color:"#64748B" }}>{e.time}</span>
                <span style={{ fontSize:11,color:"#94A3B8" }}>by {e.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 7. Pending Approvals by Officer ─────────────────────────────────────────
export function AdminPendingByOfficerScreen({ onNavigate }: Props) {
  const officers = [
    { name:"Alice Kabanda",  pending:12, urgent:3, oldest:"2.1 hrs" },
    { name:"Brian Ssali",    pending:18, urgent:7, oldest:"4.5 hrs" },
    { name:"Daniel Muwonge",pending:8,  urgent:1, oldest:"0.8 hrs" },
  ];
  return (
    <AdminLayout activeScreen="admin-pending-by-officer" onNavigate={onNavigate} title="Pending by Officer">
      <AdminPageHeader title="Pending Approvals by Officer" subtitle="Real-time workload distribution"/>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        {officers.map(o=>(
          <AdminCard key={o.name}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{o.name.split(" ").map(n=>n[0]).join("")}</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{o.name}</p>
                <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>Oldest pending: {o.oldest}</p>
              </div>
              <div style={{ display:"flex",gap:16,textAlign:"center" }}>
                <div><p style={{ fontSize:22,fontWeight:800,color:"#F59E0B",margin:0 }}>{o.pending}</p><p style={{ fontSize:10,color:"#94A3B8",margin:0 }}>Total</p></div>
                <div><p style={{ fontSize:22,fontWeight:800,color:"#EF4444",margin:0 }}>{o.urgent}</p><p style={{ fontSize:10,color:"#94A3B8",margin:0 }}>Urgent</p></div>
              </div>
              <button onClick={()=>onNavigate("admin-officer-dashboard")} style={{ padding:"6px 12px",borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>View Queue</button>
            </div>
            <div style={{ marginTop:12,height:6,background:"#F3F4F6",borderRadius:3 }}>
              <div style={{ width:`${Math.min(o.pending*5,100)}%`,height:"100%",background:o.pending>15?"#EF4444":o.pending>10?"#F59E0B":"#10B981",borderRadius:3 }}/>
            </div>
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 8. Auto-Approve Settings ─────────────────────────────────────────────────
export function AdminAutoApproveSettingsScreen({ onNavigate }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [minScore, setMinScore] = useState("720");
  const [minSavings, setMinSavings] = useState("100000");
  const [maxAmount, setMaxAmount] = useState("500000");
  return (
    <AdminLayout activeScreen="admin-auto-approve-settings" onNavigate={onNavigate} title="Auto-Approve Settings">
      <AdminPageHeader title="Auto-Approve Settings" subtitle="Configure rules for automatic loan approval"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:enabled?20:0 }}>
            <div>
              <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>Auto-Approve Engine</p>
              <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>Loans meeting all criteria are approved instantly</p>
            </div>
            <button onClick={()=>setEnabled(!enabled)} style={{ width:50,height:28,borderRadius:14,background:enabled?"#10B981":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:enabled?"flex-end":"flex-start",padding:3 }}>
              <div style={{ width:22,height:22,borderRadius:11,background:"white" }}/>
            </button>
          </div>
          {enabled && (
            <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
              {[
                { label:"Minimum Credit Score", val:minScore, set:setMinScore, suffix:"points" },
                { label:"Minimum Savings Balance (UGX)", val:minSavings, set:setMinSavings, suffix:"UGX" },
                { label:"Maximum Auto-Approve Amount (UGX)", val:maxAmount, set:setMaxAmount, suffix:"UGX" },
              ].map(({ label, val, set, suffix })=>(
                <div key={label}>
                  <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>{label}</label>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <input type="number" value={val} onChange={e=>set(e.target.value)} style={{ flex:1,height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:16,fontWeight:700,color:"#0D5C3A",outline:"none" }}/>
                    <span style={{ fontSize:12,color:"#64748B" }}>{suffix}</span>
                  </div>
                </div>
              ))}
              <div style={{ padding:"12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0" }}>
                <p style={{ fontSize:12,color:"#065F46",margin:0 }}>
                  ✓ Currently {22} loans per day are auto-approved under these rules
                </p>
              </div>
              <button style={{ height:44,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Auto-Approve Rules</button>
            </div>
          )}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 9. Loan Escalation ───────────────────────────────────────────────────────
export function AdminLoanEscalationScreen({ onNavigate }: Props) {
  const [reason, setReason] = useState("amount");
  const [notes, setNotes] = useState("");
  return (
    <AdminLayout activeScreen="admin-loan-escalation" onNavigate={onNavigate} title="Loan Escalation">
      <AdminPageHeader title="Escalate Loan Application" subtitle="KUL-2026-04821 · Amara Nakato · UGX 500,000"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:"12px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA" }}>
            <AlertTriangle size={20} color="#F59E0B"/>
            <p style={{ fontSize:13,color:"#92400E",margin:0 }}>Escalating from <strong>Junior Officer</strong> → <strong>Senior Officer</strong>. The applicant will be notified of the delay.</p>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Reason for Escalation *</label>
            {[{id:"amount",l:"Amount exceeds my approval limit"},{id:"risk",l:"High-risk applicant — needs review"},{id:"policy",l:"Policy exception required"},{id:"dispute",l:"Customer disputed decision"},{id:"other",l:"Other"}].map(r=>(
              <button key={r.id} onClick={()=>setReason(r.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,border:`2px solid ${reason===r.id?"#0D5C3A":"#E5E7EB"}`,background:reason===r.id?"#ECF5F0":"white",cursor:"pointer",marginBottom:6,textAlign:"left" }}>
                <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${reason===r.id?"#0D5C3A":"#D1D5DB"}`,background:reason===r.id?"#0D5C3A":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {reason===r.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
                </div>
                <span style={{ fontSize:13,color:"#374151" }}>{r.l}</span>
              </button>
            ))}
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Additional Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Explain why this needs escalation..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
          </div>
          <button style={{ width:"100%",height:46,borderRadius:10,background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Escalate to Senior Officer</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 10. Approval Time Tracking ───────────────────────────────────────────────
export function AdminApprovalTimeTrackingScreen({ onNavigate }: Props) {
  const data = [
    { officer:"Alice Kabanda",avg:"18 min",best:"4 min",worst:"2.1 hrs",total:847 },
    { officer:"Brian Ssali",avg:"34 min",best:"8 min",worst:"4.5 hrs",total:612 },
    { officer:"Daniel Muwonge",avg:"22 min",best:"6 min",worst:"1.8 hrs",total:495 },
  ];
  return (
    <AdminLayout activeScreen="admin-approval-time-tracking" onNavigate={onNavigate} title="Approval Time Tracking">
      <AdminPageHeader title="Approval Time Tracking" subtitle="Monitor decision speed across all officers"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Avg System-Wide" value="2.3 hrs" sub="All approval levels" color="#0D5C3A" icon={<Clock size={18} color="#0D5C3A"/>}/>
        <StatCard label="Fastest Today" value="4 min" sub="Alice · Auto-approve" color="#10B981" icon={<Check size={18} color="#10B981"/>}/>
        <StatCard label="Slowest Today" value="4.5 hrs" sub="Brian · Manual review" color="#EF4444" icon={<Clock size={18} color="#EF4444"/>}/>
        <StatCard label="SLA Breaches" value="3" sub="This week" color="#F59E0B" icon={<AlertTriangle size={18} color="#F59E0B"/>}/>
      </div>
      <AdminTable
        columns={["Officer","Avg Time","Best","Worst","Total Decisions"]}
        rows={data.map(d=>[d.officer,d.avg,d.best,d.worst,d.total.toLocaleString()])}
      />
    </AdminLayout>
  );
}

// ─── 11. Officer Performance ──────────────────────────────────────────────────
export function AdminOfficerPerformanceScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-officer-performance" onNavigate={onNavigate} title="Officer Performance">
      <AdminPageHeader title="Officer Performance" subtitle="Weekly performance metrics for all loan officers"/>
      {[
        { name:"Alice Kabanda", approved:50, rejected:8, accuracy:"95.2%", avg:"18 min", satisfaction:"4.8/5" },
        { name:"Brian Ssali",   approved:38, rejected:12, accuracy:"89.7%", avg:"34 min", satisfaction:"4.3/5" },
        { name:"Daniel Muwonge",approved:42, rejected:6, accuracy:"92.1%", avg:"22 min", satisfaction:"4.6/5" },
      ].map(o=>(
        <AdminCard key={o.name} style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:14 }}>
            <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{o.name.split(" ").map(n=>n[0]).join("")}</span>
            </div>
            <div style={{ flex:1 }}><p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{o.name}</p></div>
            <div style={{ display:"flex",alignItems:"center",gap:4 }}><Star size={14} color="#F59E0B" fill="#F59E0B"/><span style={{ fontSize:13,fontWeight:700,color:"#0F172A" }}>{o.satisfaction}</span></div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10 }}>
            {[["Approved",o.approved,"#10B981"],["Rejected",o.rejected,"#EF4444"],["Accuracy",o.accuracy,"#0D5C3A"],["Avg Time",o.avg,"#8B5CF6"],["Rating",o.satisfaction,"#F59E0B"]].map(([l,v,c])=>(
              <div key={l as string} style={{ textAlign:"center",padding:"10px 8px",background:"#F8FAFC",borderRadius:10 }}>
                <p style={{ fontSize:16,fontWeight:800,color:c as string,margin:0 }}>{v as string}</p>
                <p style={{ fontSize:10,color:"#94A3B8",margin:"2px 0 0" }}>{l as string}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      ))}
    </AdminLayout>
  );
}

// ─── 12. Loan Officer Contact ─────────────────────────────────────────────────
export function AdminOfficerContactScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-officer-contact" onNavigate={onNavigate} title="Officer Contact">
      <AdminPageHeader title="Loan Officer Contact" subtitle="Alice Kabanda — Senior Loan Officer"/>
      <div style={{ maxWidth:500 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:20 }}>
            <div style={{ width:64,height:64,borderRadius:32,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <span style={{ fontSize:24,fontWeight:800,color:"white" }}>AK</span>
            </div>
            <div>
              <p style={{ fontSize:18,fontWeight:800,color:"#0F172A",margin:0 }}>Alice Kabanda</p>
              <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>Senior Loan Officer · Kampala Branch</p>
              <span style={{ fontSize:11,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"2px 10px",borderRadius:20 }}>● Available</span>
            </div>
          </div>
          {[
            { Icon:Phone, label:"Office Phone", value:"+256 414 123 456", action:"Call" },
            { Icon:Phone, label:"Mobile", value:"+256 772 345 678", action:"Call" },
            { Icon:Mail,  label:"Email", value:"alice.kabanda@kuula.ug", action:"Email" },
          ].map(({ Icon, label, value, action })=>(
            <div key={label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #F8FAFC" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <Icon size={16} color="#64748B"/>
                <div>
                  <p style={{ fontSize:11,color:"#94A3B8",margin:0 }}>{label}</p>
                  <p style={{ fontSize:13,fontWeight:600,color:"#0F172A",margin:0 }}>{value}</p>
                </div>
              </div>
              <button style={{ padding:"6px 14px",borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:700,cursor:"pointer" }}>{action}</button>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <p style={{ fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:10 }}>Current Workload</p>
          {[["Active Loans Handling","12"],["Approved This Week","50"],["Avg Decision Time","18 min"],["Availability","Available until 5:00 PM"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 13. Customer: Officer Assigned (mobile) ──────────────────────────────────
export function CustomerOfficerAssignedScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("loan-approval")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Your Loan Officer</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px",display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ background:"white",borderRadius:20,padding:"24px",boxShadow:"0 4px 16px rgba(0,0,0,0.07)",display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center" }}>
          <div style={{ width:72,height:72,borderRadius:36,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(13,92,58,0.3)" }}>
            <span style={{ fontSize:28,fontWeight:800,color:"white" }}>AK</span>
          </div>
          <div>
            <p style={{ fontSize:18,fontWeight:800,color:"#1F2937",margin:0 }}>Alice Kabanda</p>
            <p style={{ fontSize:12,color:"#6B7280",margin:"4px 0" }}>Senior Loan Officer · Kuula</p>
            <span style={{ fontSize:11,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"3px 12px",borderRadius:20 }}>● Currently Available</span>
          </div>
          <p style={{ fontSize:13,color:"#6B7280",lineHeight:1.6 }}>Alice is handling your loan application <strong>KUL-2026-04821</strong>. She will review and process your application within 30 minutes.</p>
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          {[["Assigned","Jun 11, 2026 · 09:42 AM"],["Expected Decision","By 10:12 AM today"],["SLA","30 minutes"],["Status","Under review"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={()=>onNavigate("loan-timeline")} style={{ width:"100%",height:48,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>
          View Loan Timeline
        </button>
      </div>
      <BottomNav active="loans" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 14. Follow-up Status ────────────────────────────────────────────────────
export function AdminFollowupStatusScreen({ onNavigate }: Props) {
  const items = [
    { date:"Jun 9, 10:00 AM",type:"Call",status:"done",note:"Customer confirmed will pay Jun 15" },
    { date:"Jun 11, 2:00 PM",type:"SMS",status:"done",note:"Reminder sent successfully" },
    { date:"Jun 13, 9:00 AM",type:"Call",status:"pending",note:"Scheduled call — not yet done" },
    { date:"Jun 15, 8:00 AM",type:"Field Visit",status:"missed",note:"Officer unable to reach customer" },
  ];
  return (
    <AdminLayout activeScreen="admin-followup-status" onNavigate={onNavigate} title="Follow-up Status">
      <AdminPageHeader title="Follow-up Status — KUL-2026-04821" subtitle="Amara Nakato · Track all follow-up attempts"/>
      <div style={{ display:"flex",gap:10,marginBottom:16 }}>
        {[["Done","2","#10B981"],["Pending","1","#F59E0B"],["Missed","1","#EF4444"]].map(([l,v,c])=>(
          <div key={l} style={{ flex:1,background:"white",borderRadius:12,padding:"14px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1px solid #F1F5F9" }}>
            <p style={{ fontSize:24,fontWeight:800,color:c,margin:0 }}>{v}</p>
            <p style={{ fontSize:11,color:"#64748B",margin:0 }}>{l}</p>
          </div>
        ))}
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {items.map((it,i)=>(
          <AdminCard key={i}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:36,height:36,borderRadius:10,background:it.status==="done"?"#F0FDF4":it.status==="pending"?"#FFF7ED":"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <span style={{ fontSize:16 }}>{it.type==="Call"?"📞":it.type==="SMS"?"📱":it.type==="Field Visit"?"🚶":"📧"}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                  <span style={{ fontSize:13,fontWeight:600,color:"#0F172A" }}>{it.type}</span>
                  <StatusBadge status={it.status}/>
                </div>
                <p style={{ fontSize:11,color:"#64748B",margin:"2px 0 0" }}>{it.date}</p>
                <p style={{ fontSize:12,color:"#374151",margin:"4px 0 0" }}>{it.note}</p>
              </div>
            </div>
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 15. Follow-up History ───────────────────────────────────────────────────
export function AdminFollowupHistoryScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-followup-history" onNavigate={onNavigate} title="Follow-up History">
      <AdminPageHeader title="Follow-up History — KUL-2026-04821"/>
      <AdminTable
        columns={["Date","Officer","Type","Outcome","Notes"]}
        rows={[
          ["Jun 9, 10:00","Alice K.","Call","Customer answered","Will pay Jun 15"],
          ["Jun 11, 2:00","System","SMS","Delivered","Auto-reminder sent"],
          ["Jun 13, 9:00","Brian S.","Call","No answer","Left voicemail"],
          ["Jun 15, 8:00","Brian S.","Field Visit","Not at home","Neighbour confirmed travels"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 16. Loan Tracking Timeline (customer) ───────────────────────────────────
export function CustomerLoanTimelineScreen({ onNavigate }: Props) {
  const steps = [
    { label:"Application Submitted",  time:"Jun 11, 09:41 AM",done:true },
    { label:"Officer Assigned",        time:"Jun 11, 09:42 AM",done:true },
    { label:"Credit Check",            time:"Jun 11, 09:43 AM",done:true },
    { label:"Loan Approved",           time:"Jun 11, 09:44 AM",done:true },
    { label:"Funds Disbursed",         time:"Jun 11, 09:45 AM",done:true },
    { label:"Repayment Due",           time:"Jul 11, 2026",    done:false },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("loan-detail")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Loan Timeline</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px" }}>
        <div style={{ position:"relative",paddingLeft:28 }}>
          {steps.map((s,i)=>(
            <div key={i} style={{ position:"relative",marginBottom:24 }}>
              <div style={{ position:"absolute",left:-28,top:4,width:16,height:16,borderRadius:8,background:s.done?"#10B981":"#E5E7EB",border:"2px solid white",boxShadow:"0 0 0 2px #E2E8F0",display:"flex",alignItems:"center",justifyContent:"center" }}>
                {s.done && <Check size={9} color="white"/>}
              </div>
              {i<steps.length-1 && <div style={{ position:"absolute",left:-21,top:20,width:2,height:28,background:s.done?"#10B981":"#E5E7EB" }}/>}
              <div style={{ background:"white",borderRadius:12,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize:13,fontWeight:700,color:s.done?"#1F2937":"#9CA3AF",margin:0 }}>{s.label}</p>
                <p style={{ fontSize:11,color:s.done?"#10B981":"#D1D5DB",margin:"3px 0 0",fontWeight:s.done?600:400 }}>{s.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="loans" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 17. Officer Availability ─────────────────────────────────────────────────
export function AdminOfficerAvailabilityScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-officer-availability" onNavigate={onNavigate} title="Officer Availability">
      <AdminPageHeader title="Officer Availability" subtitle="Real-time status of all loan officers"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
        {[
          { name:"Alice Kabanda",  status:"Available",  until:"5:00 PM",  load:12, color:"#10B981" },
          { name:"Brian Ssali",    status:"In Meeting",  until:"2:30 PM",  load:18, color:"#F59E0B" },
          { name:"Christine Ajok", status:"On Leave",    until:"Jun 14",   load:0,  color:"#EF4444" },
          { name:"Daniel Muwonge",status:"Available",  until:"4:00 PM",  load:8,  color:"#10B981" },
        ].map(o=>(
          <AdminCard key={o.name}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
              <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{o.name.split(" ").map(n=>n[0]).join("")}</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{o.name}</p>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:2 }}>
                  <div style={{ width:8,height:8,borderRadius:4,background:o.color }}/>
                  <span style={{ fontSize:11,fontWeight:600,color:o.color }}>{o.status}</span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:11,color:"#64748B" }}>Until {o.until}</span>
              <span style={{ fontSize:11,fontWeight:700,color:"#374151" }}>{o.load} active loans</span>
            </div>
            {o.status==="Available" && (
              <button onClick={()=>onNavigate("admin-officer-assignment")} style={{ width:"100%",height:34,marginTop:10,borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Assign Loan</button>
            )}
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 18. Transfer Loan to Another Officer ─────────────────────────────────────
export function AdminTransferLoanScreen({ onNavigate }: Props) {
  const [target, setTarget] = useState<string|null>(null);
  const [reason, setReason] = useState("");
  return (
    <AdminLayout activeScreen="admin-transfer-loan" onNavigate={onNavigate} title="Transfer Loan">
      <AdminPageHeader title="Transfer Loan to Another Officer" subtitle="KUL-2026-04821 · Currently: Alice Kabanda"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <p style={{ fontSize:13,fontWeight:600,color:"#374151",marginBottom:12 }}>Transfer to:</p>
          {[
            { name:"Brian Ssali",   role:"Junior Officer", load:18, available:true },
            { name:"Daniel Muwonge",role:"Junior Officer", load:8,  available:true },
            { name:"Christine Ajok",role:"Senior Officer", load:20, available:false },
          ].map(o=>(
            <button key={o.name} onClick={()=>o.available&&setTarget(o.name)} style={{ width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,border:`2px solid ${target===o.name?"#0D5C3A":"#E5E7EB"}`,background:target===o.name?"#ECF5F0":o.available?"white":"#F8FAFC",cursor:o.available?"pointer":"not-allowed",marginBottom:8,opacity:o.available?1:0.5 }}>
              <div style={{ width:36,height:36,borderRadius:18,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <span style={{ fontSize:13,fontWeight:700,color:"white" }}>{o.name.split(" ").map(n=>n[0]).join("")}</span>
              </div>
              <div style={{ flex:1,textAlign:"left" }}>
                <p style={{ fontSize:13,fontWeight:700,color:"#0F172A",margin:0 }}>{o.name}</p>
                <p style={{ fontSize:11,color:"#64748B",margin:0 }}>{o.role} · {o.load} loans</p>
              </div>
              <StatusBadge status={o.available?"active":"pending"}/>
            </button>
          ))}
          <div style={{ marginTop:12 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Reason for Transfer</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="Why is this loan being transferred?" style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
          </div>
        </AdminCard>
        <button onClick={()=>{ if(target) onNavigate("admin-officer-dashboard"); }} style={{ width:"100%",height:46,borderRadius:12,background:target?"linear-gradient(135deg,#0D5C3A,#0A4A2E)":"#E5E7EB",color:target?"white":"#9CA3AF",border:"none",fontSize:14,fontWeight:700,cursor:target?"pointer":"not-allowed" }}>
          Transfer to {target??"Selected Officer"}
        </button>
      </div>
    </AdminLayout>
  );
}
