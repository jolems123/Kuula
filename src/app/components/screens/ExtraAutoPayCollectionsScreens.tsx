/**
 * Group 4 — Auto Payment (52–65) + Group 5 — Loan Collections (66–81)
 */

import React, { useState } from "react";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Phone, MessageSquare, FileText, Users, TrendingUp, Clock, Scale } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
const S: React.CSSProperties = { boxSizing: "border-box" as "border-box" };
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

// ══════════════════════════════ AUTO PAYMENT ═════════════════════════════════

// ─── 52. Customer: Auto-Payment Setup ────────────────────────────────────────
export function CustomerAutoPaySetupScreen({ onNavigate }: Props) {
  const [enabled, setEnabled] = useState(false);
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment Setup</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        {done ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <div style={{ width:80,height:80,borderRadius:40,background:"#F0FDF4",border:"2px solid #10B981",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <CheckCircle size={44} color="#10B981" strokeWidth={1.5}/>
            </div>
            <h2 style={{ fontSize:21,fontWeight:800,color:"#1F2937",textAlign:"center" }}>Auto-Payment Enabled!</h2>
            <p style={{ fontSize:13,color:"#6B7280",textAlign:"center",lineHeight:1.6 }}>Your loans will be paid automatically from MTN MoMo (+256 770 123 456) on each due date.</p>
            <div style={{ width:"100%",background:"white",borderRadius:14,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              {[["Method","MTN MoMo · +256 770 123 456"],["Timing","On due date at 8:00 AM"],["Max Amount","Full outstanding balance"],["Notification","SMS 1 day before collection"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6" }}>
                  <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#1F2937" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ background:"linear-gradient(135deg,#FFF0E8,#FFDCC8)",borderRadius:16,padding:"16px",border:"1px solid #FFDCC8" }}>
              <h3 style={{ fontSize:15,fontWeight:800,color:"#E05A2B",margin:"0 0 6px" }}>Never Miss a Payment</h3>
              <p style={{ fontSize:12,color:"#374151",margin:0,lineHeight:1.6 }}>Auto-Payment deducts your loan repayment automatically on the due date from your linked MoMo account. No manual action needed.</p>
            </div>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <p style={{ fontSize:14,fontWeight:700,color:"#1F2937",margin:0 }}>Enable Auto-Payment</p>
                  <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>Automatically pay loans on due date</p>
                </div>
                <button onClick={()=>setEnabled(!enabled)} style={{ width:50,height:28,borderRadius:14,background:enabled?"#FF6B35":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:enabled?"flex-end":"flex-start",padding:3 }}>
                  <div style={{ width:22,height:22,borderRadius:11,background:"white" }}/>
                </button>
              </div>
              {enabled && (
                <>
                  <div>
                    <p style={{ fontSize:12,fontWeight:600,color:"#374151",marginBottom:8 }}>Deduct From</p>
                    {[{id:"mtn",l:"MTN MoMo · +256 770 123 456",logo:"🟡"},{id:"airtel",l:"Airtel Money · +256 752 987 654",logo:"🔴"}].map((m,i)=>(
                      <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#FFF0E8",border:"1.5px solid #FF6B35",marginBottom:6 }}>
                        <span style={{ fontSize:20 }}>{m.logo}</span>
                        <span style={{ fontSize:13,fontWeight:600,color:"#1F2937" }}>{m.l}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:"10px 12px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA" }}>
                    <p style={{ fontSize:12,color:"#92400E",margin:0 }}>⚠ Ensure your MoMo account has sufficient funds on due dates to avoid failed collections and penalties.</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {!done && (
        <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
          <button onClick={()=>{ if(enabled) setDone(true); }} style={{ width:"100%",height:52,borderRadius:14,background:enabled?"linear-gradient(135deg,#FF6B35,#E05A2B)":"#E5E7EB",color:enabled?"white":"#9CA3AF",fontSize:16,fontWeight:700,border:"none",cursor:enabled?"pointer":"not-allowed" }}>
            Enable Auto-Payment
          </button>
        </div>
      )}
      {done && <BottomNav active="home" onNavigate={onNavigate}/>}
    </div>
  );
}

// ─── 53. Customer: Auto-Payment Settings ─────────────────────────────────────
export function CustomerAutoPaySettingsScreen({ onNavigate }: Props) {
  const [timing, setTiming] = useState("due");
  const [method, setMethod] = useState("mtn");
  const [maxAmt, setMaxAmt] = useState("full");
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment Settings</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 120px",display:"flex",flexDirection:"column",gap:14 }}>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:10 }}>Collection Timing</p>
          {[{id:"early",l:"3 days before due date"},{id:"due",l:"On due date at 8:00 AM"},{id:"late",l:"1 day after due date (grace period)"}].map(t=>(
            <button key={t.id} onClick={()=>setTiming(t.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`2px solid ${timing===t.id?"#FF6B35":"#E5E7EB"}`,background:timing===t.id?"#FFF0E8":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${timing===t.id?"#FF6B35":"#D1D5DB"}`,background:timing===t.id?"#FF6B35":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {timing===t.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>{t.l}</span>
            </button>
          ))}
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:10 }}>Payment Amount</p>
          {[{id:"full",l:"Full outstanding balance"},{id:"min",l:"Minimum due only"},{id:"custom",l:"Custom amount"}].map(a=>(
            <button key={a.id} onClick={()=>setMaxAmt(a.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`2px solid ${maxAmt===a.id?"#FF6B35":"#E5E7EB"}`,background:maxAmt===a.id?"#FFF0E8":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${maxAmt===a.id?"#FF6B35":"#D1D5DB"}`,background:maxAmt===a.id?"#FF6B35":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {maxAmt===a.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>{a.l}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Save Settings</button>
      </div>
    </div>
  );
}

// ─── 54. Customer: Auto-Payment History ──────────────────────────────────────
export function CustomerAutoPayHistoryScreen({ onNavigate }: Props) {
  const history = [
    { date:"May 25, 2026",amount:92083,status:"success",method:"MTN MoMo" },
    { date:"Apr 25, 2026",amount:92083,status:"success",method:"MTN MoMo" },
    { date:"Mar 25, 2026",amount:92083,status:"failed",method:"MTN MoMo" },
    { date:"Feb 25, 2026",amount:92083,status:"success",method:"MTN MoMo" },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment History</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        {history.map((h,i)=>(
          <div key={i} style={{ background:"white",borderRadius:14,padding:"14px 16px",border:"1px solid #F3F4F6",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:14 }}>
            <div style={{ width:40,height:40,borderRadius:12,background:h.status==="success"?"#F0FDF4":"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {h.status==="success" ? <CheckCircle size={20} color="#10B981"/> : <XCircle size={20} color="#EF4444"/>}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",margin:0 }}>Auto-Payment · {h.method}</p>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>{h.date}</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:14,fontWeight:800,color:h.status==="success"?"#10B981":"#EF4444",margin:0 }}>{ugx(h.amount)}</p>
              <span style={{ fontSize:10,color:h.status==="success"?"#10B981":"#EF4444",fontWeight:600 }}>{h.status==="success"?"✓ Success":"✗ Failed"}</span>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="wallet" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 55. Customer: Auto-Payment Failure ──────────────────────────────────────
export function CustomerAutoPayFailureScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#FEF2F2",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"#EF4444" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment Failed</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:80,height:80,borderRadius:40,background:"white",border:"2px solid #FECACA",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(239,68,68,0.2)" }}>
          <XCircle size={44} color="#EF4444" strokeWidth={1.5}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#991B1B",margin:0 }}>Auto-Payment Failed</h2>
          <p style={{ fontSize:13,color:"#B91C1C",margin:"8px 0" }}>Jun 25, 2026 at 8:00 AM</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          {[["Amount","UGX 92,083"],["Reason","Insufficient balance on MTN MoMo"],["Loan","KUL-2026-04821"],["Due Date","Jun 25, 2026"],["Penalty","5% if not paid within 7 days"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:l==="Penalty"?"#EF4444":"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ width:"100%",padding:"12px 14px",borderRadius:12,background:"#FFF7ED",border:"1px solid #FED7AA" }}>
          <p style={{ fontSize:12,color:"#92400E",margin:0 }}>⚠ Please top up your MTN MoMo and tap "Retry Now" to avoid a late penalty.</p>
        </div>
        <button onClick={()=>onNavigate("make-payment")} style={{ width:"100%",height:52,borderRadius:14,background:"#EF4444",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Pay Now</button>
        <button onClick={()=>onNavigate("customer-autopay-settings")} style={{ width:"100%",height:44,borderRadius:14,background:"white",color:"#374151",fontSize:14,fontWeight:600,border:"1px solid #E5E7EB",cursor:"pointer" }}>Change Payment Method</button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 56. Admin: Auto-Payment Rules ───────────────────────────────────────────
export function AdminAutoPayRulesScreen({ onNavigate }: Props) {
  const [days, setDays] = useState("0");
  const [retry, setRetry] = useState("3");
  return (
    <AdminLayout activeScreen="admin-autopay-rules" onNavigate={onNavigate} title="Auto-Payment Rules">
      <AdminPageHeader title="Auto-Payment Rules" subtitle="Configure how and when automatic collections run"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          {[
            { label:"Collect N days before due date", val:days, set:setDays, note:"0 = on due date, 3 = 3 days early" },
            { label:"Max retry attempts on failure", val:retry, set:setRetry, note:"Hours between retries: 24 hours" },
          ].map(({ label, val, set, note })=>(
            <div key={label} style={{ marginBottom:18 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>{label}</label>
              <input type="number" value={val} onChange={e=>set(e.target.value)} min="0" max="10" style={{ width:80,height:44,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:22,fontWeight:800,color:"#FF6B35",outline:"none",textAlign:"center" }}/>
              <p style={{ fontSize:11,color:"#94A3B8",margin:"4px 0 0" }}>{note}</p>
            </div>
          ))}
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {[{l:"Send SMS notification 1 day before collection",v:true},{l:"Stop auto-collection if account is blocked",v:true},{l:"Apply penalty automatically after 7 days overdue",v:true}].map((r,i)=>(
              <label key={i} style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}>
                <input type="checkbox" defaultChecked={r.v} style={{ accentColor:"#FF6B35",width:16,height:16 }}/>
                <span style={{ fontSize:13,color:"#374151" }}>{r.l}</span>
              </label>
            ))}
          </div>
          <button style={{ width:"100%",height:44,marginTop:20,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Rules</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 57. Admin: Auto-Collection Schedule ─────────────────────────────────────
export function AdminCollectionScheduleScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-collection-schedule" onNavigate={onNavigate} title="Collection Schedule">
      <AdminPageHeader title="Auto-Collection Schedule" subtitle="Today: Jun 11, 2026 — 50 collections scheduled"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Scheduled Today" value="50" color="#FF6B35" icon={<></>}/>
        <StatCard label="Completed" value="38" color="#10B981" icon={<></>}/>
        <StatCard label="Pending" value="10" color="#F59E0B" icon={<></>}/>
        <StatCard label="Failed" value="2" color="#EF4444" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Customer","Loan ID","Amount","Scheduled Time","Method","Status"]}
        rows={[
          ["Amara Nakato","KUL-04821",ugx(92083),"8:00 AM","MTN MoMo",<StatusBadge status="completed"/>],
          ["David Ochieng","KUL-04790",ugx(55000),"8:00 AM","Airtel Money",<StatusBadge status="completed"/>],
          ["Sarah Akello","KUL-04750",ugx(138000),"9:00 AM","MTN MoMo",<StatusBadge status="pending"/>],
          ["Tom Mugisha","KUL-04200",ugx(70000),"8:00 AM","MTN MoMo",<StatusBadge status="failed"/>],
          ["Grace Namukasa","KUL-04680",ugx(200000),"10:00 AM","Bank","Pending"],
        ].map((r,i)=>i<4?r:[...r.slice(0,5),<StatusBadge key="status" status="pending"/>])}
        onRowClick={()=>onNavigate("admin-collection-queue")}
      />
    </AdminLayout>
  );
}

// ─── 58. Admin: Collection Attempt History ────────────────────────────────────
export function AdminCollectionAttemptHistoryScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-collection-schedule" onNavigate={onNavigate} title="Collection Attempts">
      <AdminPageHeader title="Collection Attempt History" subtitle="All auto-collection attempts (success and failed)"/>
      <AdminTable
        columns={["Date/Time","Customer","Amount","Method","Status","Reason"]}
        rows={[
          ["Jun 11, 08:00","Amara Nakato",ugx(92083),"MTN MoMo",<StatusBadge status="completed"/>,"—"],
          ["Jun 11, 08:00","Tom Mugisha",ugx(70000),"MTN MoMo",<StatusBadge status="failed"/>,"Insufficient balance"],
          ["Jun 10, 08:00","David Ochieng",ugx(55000),"Airtel Money",<StatusBadge status="completed"/>,"—"],
          ["Jun 10, 08:00","Lydia Atim",ugx(30000),"MTN MoMo",<StatusBadge status="failed"/>,"Number not found"],
          ["Jun 9, 08:00","James Ssemakula",ugx(40000),"MTN MoMo",<StatusBadge status="completed"/>,"—"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 59. Admin: Failed Collection ────────────────────────────────────────────
export function AdminFailedCollectionScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-failed-collection" onNavigate={onNavigate} title="Failed Collections">
      <AdminPageHeader title="Failed Collections Today" subtitle="32 collections failed — requires manual action"
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Retry All</button>}
      />
      <div style={{ padding:"10px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16 }}>
        <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>⚠ These collections failed. Retrying or contacting customers is recommended.</p>
      </div>
      <AdminTable
        columns={["Customer","Amount","Reason","Attempts","Last Try","Action"]}
        rows={[
          ["Tom Mugisha",ugx(70000),"Insufficient balance","2","08:00 AM",<button onClick={()=>onNavigate("admin-retry-collection")} style={{ padding:"4px 10px",borderRadius:6,background:"#FFF0E8",color:"#FF6B35",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Retry</button>],
          ["Lydia Atim",ugx(30000),"Number not found","1","08:00 AM",<button style={{ padding:"4px 10px",borderRadius:6,background:"#FFF0E8",color:"#FF6B35",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Retry</button>],
          ["Richard Kato",ugx(85000),"Wallet locked","3","09:00 AM",<button style={{ padding:"4px 10px",borderRadius:6,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Call</button>],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 60. Admin: Retry Collection ─────────────────────────────────────────────
export function AdminRetryCollectionScreen({ onNavigate }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <AdminLayout activeScreen="admin-failed-collection" onNavigate={onNavigate} title="Retry Collection">
      <AdminPageHeader title="Retry Collection — Tom Mugisha"/>
      <div style={{ maxWidth:500 }}>
        <AdminCard>
          {[["Loan ID","KUL-04200"],["Amount Due",ugx(70000)],["Original Due","Jun 11, 2026"],["Failed Attempts","2 (Insufficient balance)"],["Collection Method","MTN MoMo · +256 770 987 654"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
          {done ? (
            <div style={{ marginTop:16,padding:"14px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0",display:"flex",alignItems:"center",gap:10 }}>
              <CheckCircle size={20} color="#10B981"/>
              <p style={{ fontSize:13,fontWeight:700,color:"#065F46",margin:0 }}>Collection retry successful! UGX 70,000 collected.</p>
            </div>
          ) : (
            <button onClick={()=>{ setRetrying(true); setTimeout(()=>{ setRetrying(false); setDone(true); },2000); }} style={{ width:"100%",height:46,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
              {retrying ? <><RefreshCw size={16} style={{ animation:"spin 1s linear infinite" }}/>Retrying...</> : "Retry Collection Now"}
            </button>
          )}
        </AdminCard>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </AdminLayout>
  );
}

// ─── 61. Admin: Auto-Payment Analytics ───────────────────────────────────────
export function AdminAutoPayAnalyticsScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-autopay-rules" onNavigate={onNavigate} title="Auto-Pay Analytics">
      <AdminPageHeader title="Auto-Payment Analytics" subtitle="Performance metrics for automatic collections"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Success Rate" value="85.3%" sub="This month" color="#10B981" icon={<></>}/>
        <StatCard label="Auto-Collected" value="UGX 42M" color="#FF6B35" icon={<></>}/>
        <StatCard label="Failed Amount" value="UGX 7.2M" color="#EF4444" icon={<></>}/>
        <StatCard label="Customers on Auto-Pay" value="1,847" sub="48% of borrowers" color="#8B5CF6" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Month","Scheduled","Successful","Failed","Success Rate","Amount Collected"]}
        rows={[
          ["June 2026","450","384","66","85.3%","UGX 42.1M"],
          ["May 2026","412","368","44","89.3%","UGX 40.3M"],
          ["April 2026","389","341","48","87.7%","UGX 37.4M"],
          ["March 2026","356","312","44","87.6%","UGX 34.2M"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 62-65: remaining autopay screens ────────────────────────────────────────
export function CustomerAutoPayLinkScreen({ onNavigate }: Props) {
  return <CustomerAutoPaySetupScreen onNavigate={onNavigate}/>;
}
export function CustomerAutoPayNotificationScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Pay Alert</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:72,height:72,borderRadius:36,background:"#FFF0E8",border:"2px solid #FFDCC8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36 }}>🔔</div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:20,fontWeight:800,color:"#1F2937",margin:0 }}>Auto-Payment Reminder</h2>
          <p style={{ fontSize:13,color:"#6B7280",marginTop:8,lineHeight:1.7 }}>Your loan payment of <strong>UGX 92,083</strong> will be automatically deducted from your <strong>MTN MoMo (+256 770 123 456)</strong> tomorrow, <strong>Jun 25, 2026 at 8:00 AM</strong>.</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:12,color:"#374151",margin:"0 0 8px",fontWeight:600 }}>Please ensure you have sufficient balance:</p>
          <p style={{ fontSize:18,fontWeight:900,color:"#10B981",margin:0 }}>UGX 92,083</p>
          <p style={{ fontSize:11,color:"#9CA3AF",margin:"4px 0 0" }}>Available: UGX 234,000 · ✓ Sufficient</p>
        </div>
        <button onClick={()=>onNavigate("customer-autopay-settings")} style={{ width:"100%",height:48,borderRadius:14,background:"#F3F4F6",color:"#374151",fontSize:14,fontWeight:600,border:"none",cursor:"pointer" }}>Change Settings</button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}
export function AdminCollectionQueueScreen({ onNavigate }: Props) {
  return <AdminCollectionScheduleScreen onNavigate={onNavigate}/>;
}
export function AdminCollectionFailureReasonScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-failed-collection" onNavigate={onNavigate} title="Failure Reasons">
      <AdminPageHeader title="Collection Failure Reasons" subtitle="Analysis of why auto-collections fail"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Failures (Jun)" value="66" color="#EF4444" icon={<></>}/>
        <StatCard label="Most Common" value="Insuf. Balance" color="#F59E0B" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Reason","Count","Percentage","Resolution"]}
        rows={[
          ["Insufficient balance","38","57.6%","Retry after 24h / Contact customer"],
          ["Number not found / deactivated","12","18.2%","Update customer phone number"],
          ["Wallet locked / suspended","8","12.1%","Customer to unlock MoMo"],
          ["Network timeout","5","7.6%","Automatic retry"],
          ["Customer opted out of auto-pay","3","4.5%","Manual payment required"],
        ]}
      />
    </AdminLayout>
  );
}

// ══════════════════════════════ LOAN COLLECTIONS ═════════════════════════════

// ─── 68. Admin: Collections Dashboard ────────────────────────────────────────
export function AdminCollectionsDashboardScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Collections Dashboard">
      <AdminPageHeader title="Collections Dashboard" subtitle="Manual collections team — Jun 11, 2026"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Overdue" value="18" sub="UGX 9.1M at risk" color="#EF4444" icon={<AlertTriangle size={18} color="#EF4444"/>}/>
        <StatCard label="Contacted Today" value="8" color="#FF6B35" icon={<></>}/>
        <StatCard label="Promised to Pay" value="5" color="#F59E0B" icon={<></>}/>
        <StatCard label="Collected Today" value="UGX 2.1M" color="#10B981" icon={<></>}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Overdue by Age</h3>
          {[{label:"1-30 days",count:9,color:"#F59E0B"},{label:"31-60 days",count:6,color:"#EF4444"},{label:"61-90 days",count:2,color:"#991B1B"},{label:"90+ days",count:1,color:"#450A0A"}].map(r=>(
            <div key={r.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{r.label}</span>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <div style={{ width:60,height:6,background:"#F3F4F6",borderRadius:3 }}>
                  <div style={{ width:`${(r.count/9)*60}px`,height:"100%",background:r.color,borderRadius:3 }}/>
                </div>
                <span style={{ fontSize:13,fontWeight:700,color:r.color }}>{r.count}</span>
              </div>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Team Assignments</h3>
          {[{name:"Alice Kabanda",loans:7,contacted:4},{name:"Brian Ssali",loans:6,contacted:3},{name:"Daniel Muwonge",loans:5,contacted:1}].map(a=>(
            <div key={a.name} style={{ padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{a.name}</span>
                <span style={{ fontSize:11,color:"#64748B" }}>{a.contacted}/{a.loans} contacted</span>
              </div>
              <div style={{ height:4,background:"#F3F4F6",borderRadius:2,marginTop:4 }}>
                <div style={{ width:`${(a.contacted/a.loans)*100}%`,height:"100%",background:"#FF6B35",borderRadius:2 }}/>
              </div>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 69. Admin: Call Customer ─────────────────────────────────────────────────
export function AdminCallCustomerScreen({ onNavigate }: Props) {
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [promise, setPromise] = useState("");
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Log Call">
      <AdminPageHeader title="Call Customer — Tom Mugisha" subtitle="KUL-04200 · 14 days overdue · UGX 70,000"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Customer Contact</h3>
          {[["Phone","+256 770 987 654"],["Alt Phone","+256 752 111 222"],["WhatsApp","+256 770 987 654"],["Email","tom.mugisha@gmail.com"],["District","Wakiso"],["Last Contact","Jun 9, 2026"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
                {l==="Phone"&&<button style={{ padding:"3px 10px",borderRadius:6,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Call</button>}
              </div>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Log Call Outcome</h3>
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Call Outcome</label>
              {["Customer answered — will pay","Customer answered — cannot pay now","No answer — left voicemail","Number not reachable","Wrong number"].map(o=>(
                <button key={o} onClick={()=>setOutcome(o)} style={{ width:"100%",padding:"8px 12px",borderRadius:8,border:`2px solid ${outcome===o?"#FF6B35":"#E5E7EB"}`,background:outcome===o?"#FFF0E8":"white",color:"#374151",fontSize:12,textAlign:"left",cursor:"pointer",marginBottom:6 }}>{o}</button>
              ))}
            </div>
            {outcome.includes("will pay")&&(
              <div>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Promise to Pay Date</label>
                <input type="date" value={promise} onChange={e=>setPromise(e.target.value)} style={{ width:"100%",height:40,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",...S }}/>
              </div>
            )}
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Notes</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Notes from the call..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:13,outline:"none",resize:"none",...S }}/>
            </div>
            <button style={{ height:42,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Save Call Log</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 70. Admin: Call History ──────────────────────────────────────────────────
export function AdminCallHistoryScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Call History">
      <AdminPageHeader title="Call History — Tom Mugisha" subtitle="KUL-04200 · All contact attempts"/>
      <AdminTable
        columns={["Date","Officer","Outcome","Promise Date","Notes"]}
        rows={[
          ["Jun 9, 10:00","Alice K.","Will pay Jun 15","Jun 15, 2026","Customer confirmed, sounds cooperative"],
          ["Jun 11, 9:00","Brian S.","No answer","—","Left voicemail"],
          ["Jun 13, 14:00","Alice K.","No answer","—","Phone off — sent SMS"],
          ["Jun 15, 9:00","Brian S.","Customer answered","Jun 20, 2026","Delayed due to medical issue, promised Jun 20"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 71. Admin: Repayment Plan Negotiation ────────────────────────────────────
export function AdminRepaymentNegotiationScreen({ onNavigate }: Props) {
  const [months, setMonths] = useState("6");
  const [monthly, setMonthly] = useState("20000");
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Repayment Plan">
      <AdminPageHeader title="Negotiate Repayment Plan" subtitle="Tom Mugisha · Total Owed: UGX 570,000 (incl. penalty)"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 16px" }}>Restructured Plan</h3>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Number of Months</label>
              <input type="number" value={months} onChange={e=>setMonths(e.target.value)} min="1" max="24" style={{ width:"100%",height:48,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:22,fontWeight:800,color:"#FF6B35",outline:"none",...S }}/>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Monthly Payment (UGX)</label>
              <input type="number" value={monthly} onChange={e=>setMonthly(e.target.value)} style={{ width:"100%",height:48,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:22,fontWeight:800,color:"#10B981",outline:"none",...S }}/>
            </div>
          </div>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#FFF0E8",border:"1px solid #FFDCC8",marginBottom:14 }}>
            {[["Total to Repay",ugx(Number(monthly)*Number(months))],["vs Original Owed",ugx(570000)],["Difference",ugx(Number(monthly)*Number(months)-570000)]].map(([l,v])=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"4px 0" }}>
                <span style={{ fontSize:12,color:"#374151" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#E05A2B" }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>onNavigate("admin-repayment-plan-detail")} style={{ width:"100%",height:44,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Create Repayment Plan</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 72-81: remaining collections screens (condensed) ────────────────────────
export function AdminRepaymentPlanDetailScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Repayment Plan Detail">
      <AdminPageHeader title="Repayment Plan — Tom Mugisha" subtitle="Agreed restructured plan · UGX 20,000/month × 6 months"/>
      <AdminTable
        columns={["Month","Due Date","Amount","Status"]}
        rows={[
          ["1","Jul 20, 2026",ugx(20000),<StatusBadge status="pending"/>],
          ["2","Aug 20, 2026",ugx(20000),<StatusBadge status="upcoming"/>],
          ["3","Sep 20, 2026",ugx(20000),<StatusBadge status="upcoming"/>],
          ["4","Oct 20, 2026",ugx(20000),<StatusBadge status="upcoming"/>],
          ["5","Nov 20, 2026",ugx(20000),<StatusBadge status="upcoming"/>],
          ["6","Dec 20, 2026",ugx(70000),<StatusBadge status="upcoming"/>],
        ]}
      />
    </AdminLayout>
  );
}
export function AdminPartialPaymentScreen({ onNavigate }: Props) {
  const [amount, setAmount] = useState("30000");
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Partial Payment">
      <AdminPageHeader title="Accept Partial Payment" subtitle="Tom Mugisha owes UGX 70,000 — record partial payment"/>
      <div style={{ maxWidth:480 }}>
        <AdminCard>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Payment Amount Received (UGX)</label>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{ width:"100%",height:56,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 16px",fontSize:28,fontWeight:900,color:"#10B981",outline:"none",...S }}/>
          <div style={{ marginTop:14,padding:"10px 12px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA" }}>
            <p style={{ fontSize:12,color:"#92400E",margin:0 }}>Remaining after payment: <strong>{ugx(70000-Number(amount))}</strong></p>
          </div>
          <button style={{ width:"100%",height:44,marginTop:14,borderRadius:10,background:"linear-gradient(135deg,#10B981,#059669)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Record Partial Payment</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
export function AdminCollectionNotesScreen({ onNavigate }: Props) {
  const [note, setNote] = useState("");
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Collection Notes">
      <AdminPageHeader title="Collection Notes — Tom Mugisha"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={4} placeholder="Add internal note (e.g. 'Customer promised to pay Dec 20 when salary comes')..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",resize:"none",...S }}/>
          <button style={{ width:"100%",height:42,marginTop:10,borderRadius:10,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Save Note</button>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:13,fontWeight:700,margin:"0 0 12px" }}>Previous Notes</h3>
          {[{text:"Customer promised to pay Jun 15 when he receives salary.",date:"Jun 9",officer:"Alice K."},
            {text:"Visited home — neighbour says he is out of town.",date:"Jun 13",officer:"Brian S."},
          ].map((n,i)=>(
            <div key={i} style={{ padding:"10px 0",borderBottom:i<1?"1px solid #F8FAFC":"none" }}>
              <p style={{ fontSize:12,color:"#374151",margin:"0 0 4px" }}>{n.text}</p>
              <span style={{ fontSize:10,color:"#94A3B8" }}>{n.date} · {n.officer}</span>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
export function AdminCollectionPriorityScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Collection Priority">
      <AdminPageHeader title="Collection Priority Queue" subtitle="Sorted by risk level — highest priority first"/>
      <AdminTable
        columns={["Priority","Customer","Days Overdue","Amount","Risk","Action"]}
        rows={[
          [<span style={{fontWeight:800,color:"#991B1B"}}>🔴 P1</span>,"Tom Mugisha","90+ days",ugx(70000),<StatusBadge status="high"/>,"Call Now"],
          [<span style={{fontWeight:800,color:"#EF4444"}}>🟠 P2</span>,"Richard Kato","60 days",ugx(85000),<StatusBadge status="high"/>,"Call Today"],
          [<span style={{fontWeight:800,color:"#F59E0B"}}>🟡 P3</span>,"Lydia Atim","30 days",ugx(30000),<StatusBadge status="medium"/>,"Send SMS"],
          [<span style={{fontWeight:800,color:"#F59E0B"}}>🟡 P4</span>,"Grace Mugo","14 days",ugx(92000),<StatusBadge status="medium"/>,"Send SMS"],
        ].map(r=>r.map((c,i)=>typeof c==="string"?<span key={i}>{c}</span>:c))}
        onRowClick={()=>onNavigate("admin-overdue-detail")}
      />
    </AdminLayout>
  );
}
export function AdminEscalateLegalScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Escalate to Legal">
      <AdminPageHeader title="Escalate to Legal — Tom Mugisha" subtitle="KUL-04200 · 90+ days overdue · UGX 70,000"/>
      <div style={{ maxWidth:520 }}>
        <AdminCard>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:16,display:"flex",gap:10 }}>
            <Scale size={16} color="#EF4444" style={{ flexShrink:0,marginTop:2 }}/>
            <p style={{ fontSize:12,color:"#991B1B",margin:0 }}>Escalating to legal is a last resort. This will trigger formal legal proceedings and may affect the customer's record permanently.</p>
          </div>
          {[["Loan ID","KUL-04200"],["Total Owed (incl. penalty)",ugx(70000)],["Days Overdue","92 days"],["Contact Attempts","6 calls, 4 SMS"],["Last Response","Jun 15 — promised to pay"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Legal Referral Notes</label>
            <textarea rows={3} placeholder="Summary of all collection attempts and reasons for escalation..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:13,outline:"none",resize:"none",...S }}/>
          </div>
          <button onClick={()=>onNavigate("admin-legal-case")} style={{ width:"100%",height:44,marginTop:14,borderRadius:10,background:"#EF4444",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Escalate to Legal Team</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
export function AdminLegalCaseScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Legal Case">
      <AdminPageHeader title="Legal Case — Tom Mugisha" subtitle="Case ref: LEGAL-2026-047 · Filed Jun 11, 2026"/>
      <AdminCard>
        {[["Case Reference","LEGAL-2026-047"],["Status","Under Review"],["Loan ID","KUL-04200"],["Amount Claimed",ugx(70000)],["Filed By","Alice Kabanda"],["Assigned Lawyer","Namubiru & Partners, Kampala"],["Next Hearing","Jul 15, 2026"],["Expected Resolution","Aug 2026"]].map(([l,v])=>(
          <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
            <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
          </div>
        ))}
      </AdminCard>
    </AdminLayout>
  );
}
export function AdminCollectionsTeamDashboardScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Collections Team">
      <AdminPageHeader title="Collections Team Dashboard"/>
      <AdminTable
        columns={["Collector","Assigned Loans","Contacted","Collected","Success Rate","This Month"]}
        rows={[
          ["Alice Kabanda","7","6","5","71%",ugx(4200000)],
          ["Brian Ssali","6","4","3","50%",ugx(2100000)],
          ["Daniel Muwonge","5","4","4","80%",ugx(1800000)],
        ]}
      />
    </AdminLayout>
  );
}
export function AdminCollectionSuccessRateScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-overdue-loans" onNavigate={onNavigate} title="Collection Success Rate">
      <AdminPageHeader title="Collection Success Rate" subtitle="Historical collection performance"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="June Success Rate" value="70%" color="#10B981" icon={<></>}/>
        <StatCard label="Amount Collected" value="UGX 6.4M" color="#FF6B35" icon={<></>}/>
        <StatCard label="Written Off" value="UGX 2.7M" color="#EF4444" icon={<></>}/>
        <StatCard label="In Legal" value="UGX 0.7M" color="#8B5CF6" icon={<></>}/>
      </div>
      <AdminTable columns={["Period","Overdue","Collected","Rate","Written Off"]}
        rows={[["June 2026","UGX 9.1M","UGX 6.4M","70%","UGX 1.2M"],["May 2026","UGX 7.8M","UGX 6.0M","77%","UGX 0.8M"],["April 2026","UGX 6.5M","UGX 5.1M","78%","UGX 0.7M"]]}
      />
    </AdminLayout>
  );
}
export function CustomerRepaymentOfferScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>New Repayment Plan Offer</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 20px",gap:20 }}>
        <span style={{ fontSize:48 }}>🤝</span>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:21,fontWeight:800,color:"#1F2937",margin:0 }}>Flexible Repayment Plan</h2>
          <p style={{ fontSize:13,color:"#6B7280",marginTop:8,lineHeight:1.6 }}>Kuula has offered you a restructured repayment plan to help you clear your overdue loan.</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          {[["Original Owed",ugx(70000)],["New Monthly Payment",ugx(20000)],["Duration","6 months"],["Total (New Plan)",ugx(120000)],["Interest Waived","None"],["Offer Expires","Jun 25, 2026"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={()=>onNavigate("customer-accept-plan")} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#10B981,#059669)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Review & Accept Plan</button>
        <button style={{ width:"100%",height:44,borderRadius:14,background:"transparent",color:"#6B7280",fontSize:14,border:"none",cursor:"pointer" }}>Decline — I'll Pay in Full</button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}
export function CustomerAcceptPlanScreen({ onNavigate }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#FF6B35,#E05A2B)" }}>
        <button onClick={()=>onNavigate("customer-repayment-offer")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Accept Repayment Plan</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:"20px 20px 120px",gap:16 }}>
        {done ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <CheckCircle size={56} color="#10B981" strokeWidth={1.5}/>
            <h2 style={{ fontSize:21,fontWeight:800,color:"#1F2937",textAlign:"center" }}>Plan Accepted!</h2>
            <p style={{ fontSize:13,color:"#6B7280",textAlign:"center",lineHeight:1.6 }}>Your first payment of UGX 20,000 is due <strong>Jul 20, 2026</strong>. Auto-pay has been enabled.</p>
            <button onClick={()=>onNavigate("home")} style={{ width:"100%",height:50,borderRadius:14,background:"linear-gradient(135deg,#FF6B35,#E05A2B)",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>Back to Home</button>
          </div>
        ) : (
          <>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize:13,color:"#374151",lineHeight:1.7 }}>By accepting, I agree to pay <strong>UGX 20,000 per month for 6 months</strong> starting July 20, 2026. Missed payments will resume normal overdue penalties.</p>
            </div>
            <button onClick={()=>setAgreed(!agreed)} style={{ display:"flex",alignItems:"center",gap:12,padding:"14px",background:"white",borderRadius:12,border:`2px solid ${agreed?"#10B981":"#E5E7EB"}`,cursor:"pointer",textAlign:"left" }}>
              <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${agreed?"#10B981":"#D1D5DB"}`,background:agreed?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {agreed&&<CheckCircle size={14} color="white"/>}
              </div>
              <span style={{ fontSize:12,color:"#374151",lineHeight:1.5 }}>I agree to these repayment terms and authorise auto-collection from my MTN MoMo account.</span>
            </button>
            <button onClick={()=>{ if(agreed) setDone(true); }} style={{ width:"100%",height:52,borderRadius:14,background:agreed?"linear-gradient(135deg,#10B981,#059669)":"#E5E7EB",color:agreed?"white":"#9CA3AF",fontSize:16,fontWeight:700,border:"none",cursor:agreed?"pointer":"not-allowed" }}>
              I Agree — Accept Plan
            </button>
          </>
        )}
      </div>
      {!done&&<BottomNav active="home" onNavigate={onNavigate}/>}
    </div>
  );
}
