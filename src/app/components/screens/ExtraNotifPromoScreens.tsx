/**
 * Group 2 — Notifications & Promotions (screens 19–33)
 */

import React, { useState } from "react";
import { Bell, Plus, Target, TrendingUp, Send, BarChart3, Gift, Tag, CheckCircle, ArrowLeft } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

// ─── 19. Notification Trigger Settings ───────────────────────────────────────
export function AdminNotifTriggersScreen({ onNavigate }: Props) {
  const triggers = [
    { event:"Payment Due",     timing:"3 days before",   channel:"SMS + Push", enabled:true },
    { event:"Payment Due",     timing:"1 day before",    channel:"SMS + Push", enabled:true },
    { event:"Payment Overdue", timing:"Same day",        channel:"SMS",        enabled:true },
    { event:"Loan Approved",   timing:"Immediately",     channel:"SMS + Push + Email", enabled:true },
    { event:"Loan Rejected",   timing:"Immediately",     channel:"SMS + Email",enabled:true },
    { event:"Credit Score Up", timing:"On milestone",    channel:"Push",       enabled:false },
    { event:"Savings Interest",timing:"Monthly",         channel:"Push",       enabled:true },
  ];
  const [list, setList] = useState(triggers);
  const { t } = useTranslation();
  return (
    <AdminLayout activeScreen="admin-notif-triggers" onNavigate={onNavigate} title="Notification Triggers">
      <AdminPageHeader title="Notification Trigger Settings" subtitle="Configure when notifications are sent automatically"
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#0B5E3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/>Add Trigger</button>}
      />
      <div style={{ background:"white",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        {list.map((t, i) => (
          <div key={i} style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:i<list.length-1?"1px solid #F8FAFC":"none" }}>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13,fontWeight:700,color:"#0F172A",margin:0 }}>{t.event}</p>
              <p style={{ fontSize:11,color:"#64748B",margin:"2px 0 0" }}>Sent {t.timing} · via {t.channel}</p>
            </div>
            <button onClick={()=>setList(l=>l.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))} style={{ width:46,height:26,borderRadius:13,background:t.enabled?"#0B5E3A":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:t.enabled?"flex-end":"flex-start",padding:3 }}>
              <div style={{ width:20,height:20,borderRadius:10,background:"white" }}/>
            </button>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 20. (Notification Templates already exists as admin-notif-templates) ─────
// Reusing existing screen — skip duplicate

// ─── 21. Promotional Campaigns List ──────────────────────────────────────────
export function AdminCampaignsListScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-campaigns-list" onNavigate={onNavigate} title="Campaigns">
      <AdminPageHeader title="Promotional Campaigns" subtitle="3 active · 2 scheduled · 8 completed"
        action={<button onClick={()=>onNavigate("admin-create-campaign")} style={{ padding:"8px 14px",borderRadius:8,background:"#0B5E3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus size={14}/>New Campaign</button>}
      />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Active Campaigns" value="3" color="#178654" icon={<></>}/>
        <StatCard label="Reached This Month" value="2,341" color="#0B5E3A" icon={<></>}/>
        <StatCard label="Conversion Rate" value="18.4%" color="#F59E0B" icon={<></>}/>
        <StatCard label="Revenue Attributed" value="UGX 12M" color="#8B5CF6" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Campaign","Type","Target","Reach","Conversions","Status"]}
        rows={[
          ["First Loan Discount","Rate Discount","New Users","1,200",<span style={{fontWeight:700,color:"#178654"}}>220</span>,<StatusBadge status="active"/>],
          ["High Score Reward","Credit Limit Up","Score 750+","580",<span style={{fontWeight:700,color:"#178654"}}>91</span>,<StatusBadge status="active"/>],
          ["Referral Bonus","Cash Back","All Users","3,847",<span style={{fontWeight:700,color:"#178654"}}>314</span>,<StatusBadge status="active"/>],
          ["Year-End Special","Rate Discount","All Users","—","—",<StatusBadge status="pending"/>],
        ]}
        onRowClick={()=>onNavigate("admin-campaign-dashboard")}
      />
    </AdminLayout>
  );
}

// ─── 22. Create Promotion ─────────────────────────────────────────────────────
export function AdminCreateCampaignScreen({ onNavigate }: Props) {
  const [type, setType] = useState("rate");
  return (
    <AdminLayout activeScreen="admin-create-campaign" onNavigate={onNavigate} title="Create Campaign">
      <AdminPageHeader title="Create Promotion Campaign" subtitle="Design a new offer for Kuula customers"/>
      <div style={{ maxWidth:640 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Campaign Name</label>
              <input placeholder="e.g. First Loan 5% Discount" style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:14,color:"#374151",outline:"none",boxSizing:"border-box" as "border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Promotion Type</label>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {[{id:"rate",l:"Interest Rate Discount"},{id:"limit",l:"Credit Limit Increase"},{id:"fee",l:"Fee Waiver"},{id:"cashback",l:"Cash Back"},{id:"referral",l:"Referral Bonus"}].map(t=>(
                  <button key={t.id} onClick={()=>setType(t.id)} style={{ padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:type===t.id?"#0B5E3A":"#F3F4F6",color:type===t.id?"white":"#6B7280" }}>{t.l}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <div>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Discount / Value</label>
                <input placeholder="e.g. 5% or UGX 20,000" style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
              <div>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Max Uses</label>
                <input type="number" placeholder="e.g. 500" style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
              <div>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Start Date</label>
                <input type="date" style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
              <div>
                <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>End Date</label>
                <input type="date" style={{ width:"100%",height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box" }}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Description</label>
              <textarea rows={3} placeholder="Describe the promotion terms..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>onNavigate("admin-campaign-targeting")} style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Next: Set Targeting →</button>
              <button style={{ flex:1,height:46,borderRadius:10,background:"#F3F4F6",color:"#64748B",border:"none",fontSize:14,fontWeight:600,cursor:"pointer" }}>Save Draft</button>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 23. Promotion Targeting ──────────────────────────────────────────────────
export function AdminCampaignTargetingScreen({ onNavigate }: Props) {
  const [audience, setAudience] = useState("new");
  const [minScore, setMinScore] = useState("600");
  return (
    <AdminLayout activeScreen="admin-campaign-targeting" onNavigate={onNavigate} title="Campaign Targeting">
      <AdminPageHeader title="Promotion Targeting" subtitle="Define which customers see this offer"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <p style={{ fontSize:13,fontWeight:600,color:"#374151",marginBottom:12 }}>Target Audience</p>
          {[
            {id:"new",l:"New customers (no previous loan)"},
            {id:"returning",l:"Returning customers (1+ loans)"},
            {id:"score",l:"High credit score (configurable threshold)"},
            {id:"savings",l:"Customers with active savings"},
            {id:"all",l:"All customers"},
          ].map(a=>(
            <button key={a.id} onClick={()=>setAudience(a.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:`2px solid ${audience===a.id?"#0B5E3A":"#E5E7EB"}`,background:audience===a.id?"#F3FAF7":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${audience===a.id?"#0B5E3A":"#D1D5DB"}`,background:audience===a.id?"#0B5E3A":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {audience===a.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>{a.l}</span>
            </button>
          ))}
          {audience==="score" && (
            <div style={{ marginTop:10 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Minimum Credit Score</label>
              <input type="number" value={minScore} onChange={e=>setMinScore(e.target.value)} style={{ width:120,height:42,borderRadius:8,border:"1.5px solid #E5E7EB",padding:"0 12px",fontSize:16,fontWeight:700,color:"#0B5E3A",outline:"none" }}/>
            </div>
          )}
          <div style={{ marginTop:16,padding:"10px 14px",borderRadius:10,background:"#F3FAF7",border:"1px solid #DFF2E9" }}>
            <p style={{ fontSize:12,color:"#374151",margin:0 }}>📊 Estimated reach: <strong>1,200 customers</strong> match this criteria</p>
          </div>
        </AdminCard>
        <button onClick={()=>onNavigate("admin-campaigns-list")} style={{ width:"100%",height:46,borderRadius:12,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>
          Save & Launch Campaign
        </button>
      </div>
    </AdminLayout>
  );
}

// ─── 24. Promotion Dashboard ──────────────────────────────────────────────────
export function AdminCampaignDashboardScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-campaign-dashboard" onNavigate={onNavigate} title="Campaign Dashboard">
      <AdminPageHeader title="Campaign Dashboard — First Loan Discount" subtitle="5% interest rate discount · Jun 1 – Aug 31, 2026"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Total Reached" value="1,200" color="#0B5E3A" icon={<></>}/>
        <StatCard label="Claimed" value="220" sub="18.3% conversion" color="#178654" icon={<></>}/>
        <StatCard label="Loans Generated" value="198" color="#8B5CF6" icon={<></>}/>
        <StatCard label="Revenue Attributed" value="UGX 4.2M" color="#F59E0B" icon={<></>}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Campaign Details</h3>
          {[["Offer","5% lower interest rate"],["Valid For","First-time borrowers"],["Max Uses","500"],["Used","220 (44%)"],["Start","Jun 1, 2026"],["End","Aug 31, 2026"],["Status","Active"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Daily Claims</h3>
          <div style={{ display:"flex",alignItems:"flex-end",gap:4,height:80 }}>
            {[4,8,12,7,15,18,10,22,19,14,11,8,5].map((v,i)=>(
              <div key={i} style={{ flex:1,borderRadius:"3px 3px 0 0",background:i===12?"#178654":"#DFF2E9",height:`${(v/22)*80}px` }}/>
            ))}
          </div>
          <div style={{ display:"flex",gap:14,marginTop:16 }}>
            <button style={{ flex:1,height:38,borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:700,cursor:"pointer" }}>Pause</button>
            <button style={{ flex:1,height:38,borderRadius:8,background:"#F3F4F6",color:"#374151",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Edit</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 25. Customer Notification History (mobile) ───────────────────────────────
export function CustomerNotifHistoryScreen({ onNavigate }: Props) {
  const items = [
    { icon:"✅",title:"Loan Approved!",body:"Your UGX 500,000 loan was approved.",time:"2 hrs ago",read:false },
    { icon:"💳",title:"Payment Due in 14 Days",body:"Your payment of UGX 92,083 is due Jun 25.",time:"5 hrs ago",read:false },
    { icon:"💰",title:"Savings Interest Credited",body:"UGX 3,400 added to your savings.",time:"1 day ago",read:true },
    { icon:"🎁",title:"New Promotion Available",body:"You qualify for a 5% rate discount!",time:"3 days ago",read:true },
    { icon:"⭐",title:"Credit Score Updated",body:"Your score increased to 742. Excellent!",time:"1 week ago",read:true },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0B5E3A,#064A2E)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
            <ArrowLeft size={18} color="white"/>
          </button>
          <span style={{ fontSize:17,fontWeight:700,color:"white" }}>Notification History</span>
        </div>
        <span style={{ fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:500 }}>12 total</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        {items.map((n,i)=>(
          <div key={i} style={{ background:n.read?"#F9FAFB":"white",borderRadius:14,padding:"14px 16px",border:n.read?"1px solid #F3F4F6":"1px solid #DFF2E9",boxShadow:n.read?"none":"0 2px 8px rgba(11,94,58,0.07)",display:"flex",gap:12 }}>
            <span style={{ fontSize:24,flexShrink:0 }}>{n.icon}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13,fontWeight:n.read?600:700,color:"#1F2937",margin:0 }}>{n.title}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:"3px 0",lineHeight:1.4 }}>{n.body}</p>
              <span style={{ fontSize:10,color:"#9CA3AF" }}>{n.time}</span>
            </div>
            {!n.read && <div style={{ width:8,height:8,borderRadius:4,background:"#0B5E3A",flexShrink:0,marginTop:4 }}/>}
          </div>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 26. Bulk Notification Send (admin) ───────────────────────────────────────
export function AdminBulkNotifScreen({ onNavigate }: Props) {
  const [channel, setChannel] = useState("sms");
  const [audience, setAudience] = useState("all");
  const [msg, setMsg] = useState("");
  return (
    <AdminLayout activeScreen="admin-bulk-notif" onNavigate={onNavigate} title="Bulk Notification">
      <AdminPageHeader title="Bulk Notification Send" subtitle="Send notification to multiple customers at once"/>
      <div style={{ maxWidth:600 }}>
        <AdminCard>
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Channel</label>
              <div style={{ display:"flex",gap:8 }}>
                {[{id:"sms",l:"📱 SMS"},{id:"push",l:"🔔 Push"},{id:"email",l:"📧 Email"},{id:"all",l:"All Channels"}].map(c=>(
                  <button key={c.id} onClick={()=>setChannel(c.id)} style={{ flex:1,height:40,borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:channel===c.id?"#0B5E3A":"#F3F4F6",color:channel===c.id?"white":"#6B7280" }}>{c.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Audience</label>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {[{id:"all",l:"All (3,847)"},{id:"active",l:"Active Borrowers (1,203)"},{id:"overdue",l:"Overdue (18)"},{id:"savings",l:"Savers (2,341)"}].map(a=>(
                  <button key={a.id} onClick={()=>setAudience(a.id)} style={{ padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:audience===a.id?"#0B5E3A":"#F3F4F6",color:audience===a.id?"white":"#6B7280" }}>{a.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Message</label>
              <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="Use {{name}}, {{amount}}, {{due_date}} for personalization..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
              <span style={{ fontSize:11,color:"#94A3B8" }}>{msg.length}/160 characters</span>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button style={{ flex:1,height:46,borderRadius:10,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
                <Send size={16}/> Send Now
              </button>
              <button style={{ flex:1,height:46,borderRadius:10,background:"#F3F4F6",color:"#374151",border:"none",fontSize:14,fontWeight:600,cursor:"pointer" }}>Schedule</button>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 27. Payment Reminder Settings ───────────────────────────────────────────
export function AdminPaymentReminderSettingsScreen({ onNavigate }: Props) {
  const [reminders, setReminders] = useState([
    { days:"3", channel:"SMS", enabled:true },
    { days:"1", channel:"SMS + Push", enabled:true },
    { days:"0", channel:"SMS + Push + Email", enabled:true },
  ]);
  return (
    <AdminLayout activeScreen="admin-payment-reminder-settings" onNavigate={onNavigate} title="Payment Reminders">
      <AdminPageHeader title="Payment Reminder Settings" subtitle="Configure automated payment reminders"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:16 }}>Reminder Schedule</p>
          {reminders.map((r,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:i<reminders.length-1?"1px solid #F8FAFC":"none" }}>
              <div style={{ width:56,height:38,borderRadius:8,border:"1.5px solid #E5E7EB",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <input type="number" value={r.days} onChange={e=>setReminders(rs=>rs.map((x,j)=>j===i?{...x,days:e.target.value}:x))} style={{ width:"100%",border:"none",outline:"none",fontSize:16,fontWeight:800,color:"#0B5E3A",textAlign:"center",background:"transparent" }}/>
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>days before via {r.channel}</span>
              <div style={{ flex:1 }}/>
              <button onClick={()=>setReminders(rs=>rs.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))} style={{ width:44,height:24,borderRadius:12,background:r.enabled?"#0B5E3A":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:r.enabled?"flex-end":"flex-start",padding:2 }}>
                <div style={{ width:20,height:20,borderRadius:10,background:"white" }}/>
              </button>
            </div>
          ))}
          <button style={{ display:"flex",alignItems:"center",gap:6,marginTop:14,padding:"8px 14px",borderRadius:8,background:"#F3FAF7",border:"none",color:"#0B5E3A",fontSize:12,fontWeight:600,cursor:"pointer" }}>
            <Plus size={14}/> Add Reminder
          </button>
        </AdminCard>
        <button style={{ width:"100%",height:46,borderRadius:12,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Reminder Settings</button>
      </div>
    </AdminLayout>
  );
}

// ─── 28. Overdue Notification Settings ───────────────────────────────────────
export function AdminOverdueNotifSettingsScreen({ onNavigate }: Props) {
  const [steps, setSteps] = useState([
    { day:1,  msg:"SMS: Your Kuula loan is 1 day overdue. Pay now to avoid penalty.", enabled:true },
    { day:7,  msg:"SMS + Email: Your loan is 7 days overdue. Penalty of 5%/week applied.", enabled:true },
    { day:30, msg:"SMS + Call: URGENT - 30 days overdue. Legal action may be initiated.", enabled:true },
  ]);
  return (
    <AdminLayout activeScreen="admin-overdue-notif-settings" onNavigate={onNavigate} title="Overdue Notifications">
      <AdminPageHeader title="Overdue Notification Settings" subtitle="Configure escalation messages for overdue loans"/>
      <div style={{ maxWidth:600 }}>
        {steps.map((s,i)=>(
          <AdminCard key={i} style={{ marginBottom:14 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
              <span style={{ fontSize:13,fontWeight:700,color:s.day>=30?"#EF4444":s.day>=7?"#F59E0B":"#374151" }}>Day {s.day} Overdue</span>
              <button onClick={()=>setSteps(ss=>ss.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))} style={{ width:44,height:24,borderRadius:12,background:s.enabled?"#0B5E3A":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:s.enabled?"flex-end":"flex-start",padding:2 }}>
                <div style={{ width:20,height:20,borderRadius:10,background:"white" }}/>
              </button>
            </div>
            <textarea defaultValue={s.msg} rows={2} style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:12,outline:"none",boxSizing:"border-box" as "border-box",resize:"none",color:"#374151" }}/>
          </AdminCard>
        ))}
        <button style={{ width:"100%",height:46,borderRadius:12,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Overdue Settings</button>
      </div>
    </AdminLayout>
  );
}

// ─── 29. Credit Score Milestone (admin config) ────────────────────────────────
export function AdminCreditMilestoneScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-credit-milestone" onNavigate={onNavigate} title="Credit Milestones">
      <AdminPageHeader title="Credit Score Milestone Notifications" subtitle="Reward customers when they hit credit score targets"/>
      <div style={{ maxWidth:600 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {[
            { score:600,label:"Good",reward:"Access to UGX 500K loans",color:"#064A2E" },
            { score:700,label:"Very Good",reward:"Access to UGX 1M loans",color:"#8B5CF6" },
            { score:750,label:"Excellent",reward:"0.5% lower interest rate",color:"#178654" },
            { score:800,label:"Elite",reward:"1% lower interest + higher limit",color:"#F59E0B" },
          ].map(m=>(
            <AdminCard key={m.score}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <div style={{ width:48,height:48,borderRadius:14,background:m.color+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:m.color }}>{m.score}</div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0 }}>{m.label} Milestone</p>
                  <p style={{ fontSize:12,color:"#64748B",margin:"2px 0 0" }}>Reward: {m.reward}</p>
                </div>
                <button style={{ padding:"6px 12px",borderRadius:8,background:"#F3FAF7",color:"#0B5E3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Edit</button>
              </div>
            </AdminCard>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

// ─── 30. Promotion Expiry Screen ──────────────────────────────────────────────
export function AdminPromotionExpiryScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-promotion-expiry" onNavigate={onNavigate} title="Promotion Expiry">
      <AdminPageHeader title="Promotion Expiry Management" subtitle="Monitor promotions nearing their end date"/>
      <AdminTable
        columns={["Campaign","End Date","Days Left","Claims","Action"]}
        rows={[
          ["First Loan Discount","Aug 31, 2026",81,"220/500",<button style={{ padding:"4px 10px",borderRadius:6,background:"#F3FAF7",color:"#0B5E3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Extend</button>],
          ["High Score Reward","Jul 15, 2026",34,"91/200",<button style={{ padding:"4px 10px",borderRadius:6,background:"#F3FAF7",color:"#0B5E3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Extend</button>],
          ["Referral Bonus","Jun 30, 2026",19,"314/1000",<button style={{ padding:"4px 10px",borderRadius:6,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>End Early</button>],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 31. Customer: Available Promotions (mobile) ──────────────────────────────
export function CustomerAvailablePromotionsScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0B5E3A,#064A2E)" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Available Promotions</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px 16px 90px",display:"flex",flexDirection:"column",gap:14 }}>
        <p style={{ fontSize:13,color:"#6B7280" }}>You qualify for 2 exclusive promotions based on your profile.</p>
        {[
          { title:"First Loan Discount",desc:"Get 5% lower interest rate on your next loan",badge:"New",color:"#178654",icon:"🎁",expires:"Aug 31, 2026" },
          { title:"High Score Reward",desc:"Your score of 742 unlocks an increased credit limit of UGX 2,000,000",badge:"Exclusive",color:"#8B5CF6",icon:"⭐",expires:"Jul 15, 2026" },
        ].map((p,i)=>(
          <div key={i} style={{ background:"white",borderRadius:20,padding:"20px",boxShadow:"0 4px 16px rgba(0,0,0,0.07)",border:`1px solid ${p.color}25` }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
              <span style={{ fontSize:32 }}>{p.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <p style={{ fontSize:15,fontWeight:800,color:"#1F2937",margin:0 }}>{p.title}</p>
                  <span style={{ fontSize:10,fontWeight:700,color:p.color,background:p.color+"15",padding:"2px 8px",borderRadius:20 }}>{p.badge}</span>
                </div>
                <p style={{ fontSize:12,color:"#6B7280",margin:"4px 0 0",lineHeight:1.5 }}>{p.desc}</p>
              </div>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ fontSize:11,color:"#9CA3AF" }}>Expires {p.expires}</span>
              <button onClick={()=>onNavigate("customer-claim-promotion")} style={{ padding:"8px 18px",borderRadius:10,background:`linear-gradient(135deg,${p.color},${p.color}CC)`,color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>
                Claim Offer
              </button>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 32. Customer: Claim Promotion (mobile) ───────────────────────────────────
export function CustomerClaimPromotionScreen({ onNavigate }: Props) {
  const [claimed, setClaimed] = useState(false);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0B5E3A,#064A2E)" }}>
        <button onClick={()=>onNavigate("customer-available-promotions")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Claim Promotion</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 20px",gap:20 }}>
        {claimed ? (
          <>
            <div style={{ width:80,height:80,borderRadius:40,background:"#F0FDF4",border:"2px solid #178654",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <CheckCircle size={44} color="#178654" strokeWidth={1.5}/>
            </div>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Promotion Claimed! 🎉</h2>
              <p style={{ fontSize:13,color:"#6B7280",marginTop:8,lineHeight:1.6 }}>Your 5% discount has been applied to your account. It will be used automatically on your next loan application.</p>
            </div>
            <button onClick={()=>onNavigate("loan-apply")} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Apply for Loan Now</button>
          </>
        ) : (
          <>
            <span style={{ fontSize:48 }}>🎁</span>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>First Loan Discount</h2>
              <p style={{ fontSize:32,fontWeight:900,color:"#178654",margin:"8px 0" }}>5% OFF</p>
              <p style={{ fontSize:13,color:"#6B7280",lineHeight:1.6 }}>Interest rate discount on your first loan. Valid for 30 days from today. Maximum loan UGX 500,000.</p>
            </div>
            <div style={{ width:"100%",padding:"14px",borderRadius:14,background:"white",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
              {[["Normal Rate","8% / month"],["Your Rate","7.6% / month"],["You Save","UGX 2,000 on UGX 500K"],["Expiry","Jul 11, 2026"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6" }}>
                  <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={()=>setClaimed(true)} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#178654,#059669)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",boxShadow:"0 4px 12px rgba(16,185,129,0.3)" }}>
              Claim This Offer
            </button>
          </>
        )}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 33. Notification Analytics (admin) ───────────────────────────────────────
export function AdminNotifAnalyticsScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-notif-analytics" onNavigate={onNavigate} title="Notification Analytics">
      <AdminPageHeader title="Notification Analytics" subtitle="Track open rates, click rates, and delivery stats"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="SMS Delivery Rate" value="98.3%" sub="12,847 sent" color="#178654" icon={<></>}/>
        <StatCard label="Push Open Rate" value="67.2%" sub="8,241 sent" color="#0B5E3A" icon={<></>}/>
        <StatCard label="Email Open Rate" value="42.8%" sub="4,103 sent" color="#8B5CF6" icon={<></>}/>
        <StatCard label="Opt-Out Rate" value="1.2%" sub="48 this month" color="#EF4444" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Notification Type","Sent","Delivered","Opened","Clicked","Opt-Outs"]}
        rows={[
          ["Payment Reminder (3d)","2,341","2,302 (98%)","—","—","2"],
          ["Loan Approved","847","847 (100%)","791 (93%)","612 (72%)","0"],
          ["Loan Rejected","123","123 (100%)","98 (80%)","34 (28%)","1"],
          ["Overdue Alert","89","87 (98%)","82 (94%)","71 (87%)","3"],
          ["Credit Score Update","512","511 (99%)","423 (83%)","298 (58%)","0"],
          ["Promotion Offer","3,847","3,801 (99%)","1,782 (47%)","627 (33%)","14"],
        ]}
      />
    </AdminLayout>
  );
}
