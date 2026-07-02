/**
 * Group 3 — Customer Support (screens 34–51)
 * Customer: 34-45  |  Admin: 46-51
 */

import React, { useState } from "react";
import { ArrowLeft, Send, MessageCircle, Phone, Mail, ChevronRight, CheckCircle, AlertTriangle, Clock, BarChart3, Users } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

const S: React.CSSProperties = { boxSizing: "border-box" as "border-box" };

// ─── 34. Customer: Support Chat ──────────────────────────────────────────────
export function CustomerSupportChatScreen({ onNavigate }: Props) {
  const [msg, setMsg] = useState("");
  const { t } = useTranslation();
  const [msgs, setMsgs] = useState([
    { from:"agent",text:"Hello Amara! I'm Lisa from Kuula support. How can I help you today?",time:"09:41 AM" },
  ]);
  const send = () => {
    if (!msg.trim()) return;
    setMsgs(m=>[...m,{from:"user",text:msg,time:"Now"},{from:"agent",text:"Thank you for reaching out. I'm looking into this for you — please allow me 2 minutes.",time:"Now"}]);
    setMsg("");
  };
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
            <ArrowLeft size={18} color="white"/>
          </button>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ width:34,height:34,borderRadius:17,background:"#10B981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"white" }}>L</div>
            <div>
              <p style={{ fontSize:14,fontWeight:700,color:"white",margin:0 }}>Lisa · Kuula Support</p>
              <p style={{ fontSize:10,color:"rgba(255,255,255,0.75)",margin:0 }}>● Online — Avg response: 2 min</p>
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:10 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"80%",padding:"10px 14px",borderRadius:m.from==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.from==="user"?"#0D5C3A":"white",boxShadow:"0 2px 6px rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize:13,color:m.from==="user"?"white":"#1F2937",margin:0,lineHeight:1.5 }}>{m.text}</p>
              <span style={{ fontSize:10,color:m.from==="user"?"rgba(255,255,255,0.7)":"#9CA3AF",display:"block",textAlign:"right",marginTop:4 }}>{m.time}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding:"12px 16px",background:"white",borderTop:"1px solid #F3F4F6",display:"flex",gap:8 }}>
        <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Type your message..." style={{ flex:1,height:46,borderRadius:12,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,outline:"none" }}/>
        <button onClick={send} style={{ width:46,height:46,borderRadius:12,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Send size={18} color="white"/>
        </button>
      </div>
    </div>
  );
}

// ─── 35. Customer: Chat History ───────────────────────────────────────────────
export function CustomerChatHistoryScreen({ onNavigate }: Props) {
  const chats = [
    { agent:"Lisa",topic:"Payment confirmation issue",date:"Jun 11, 2026",status:"Resolved",preview:"Thank you, your payment has been confirmed..." },
    { agent:"James",topic:"Loan application query",date:"May 25, 2026",status:"Resolved",preview:"Your application was reviewed and approved..." },
    { agent:"Sarah",topic:"Account access problem",date:"Apr 10, 2026",status:"Resolved",preview:"Your account has been restored. Please..." },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("customer-support-chat")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Chat History</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        {chats.map((c,i)=>(
          <button key={i} onClick={()=>onNavigate("customer-support-chat")} style={{ background:"white",borderRadius:14,padding:"14px 16px",border:"1px solid #F3F4F6",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",cursor:"pointer",textAlign:"left",display:"flex",gap:12,width:"100%" }}>
            <div style={{ width:44,height:44,borderRadius:22,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <span style={{ fontSize:16,fontWeight:700,color:"white" }}>{c.agent[0]}</span>
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",margin:0 }}>{c.topic}</p>
                <span style={{ fontSize:10,color:"#10B981",fontWeight:600 }}>{c.status}</span>
              </div>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0" }}>Agent {c.agent} · {c.date}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.preview}</p>
            </div>
          </button>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 36. Customer: Create Ticket ─────────────────────────────────────────────
export function CustomerCreateTicketScreen({ onNavigate }: Props) {
  const [category, setCategory] = useState("loan");
  const [priority, setPriority] = useState("medium");
  const [desc, setDesc] = useState("");
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Submit Ticket</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:14 }}>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Issue Category</label>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {[{id:"loan",l:"Loan Issue"},{id:"payment",l:"Payment"},{id:"account",l:"Account"},{id:"savings",l:"Savings"},{id:"other",l:"Other"}].map(c=>(
                <button key={c.id} onClick={()=>setCategory(c.id)} style={{ padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:category===c.id?"#0D5C3A":"#F3F4F6",color:category===c.id?"white":"#6B7280" }}>{c.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Subject</label>
            <input placeholder="Brief summary of your issue" style={{ width:"100%",height:46,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,outline:"none",...S }}/>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Description</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={5} placeholder="Describe your issue in detail. Include loan ID, dates, and amounts if relevant..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",resize:"none",...S }}/>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Priority</label>
            <div style={{ display:"flex",gap:8 }}>
              {[{id:"low",l:"Low",c:"#10B981"},{id:"medium",l:"Medium",c:"#F59E0B"},{id:"high",l:"High",c:"#EF4444"}].map(p=>(
                <button key={p.id} onClick={()=>setPriority(p.id)} style={{ flex:1,height:38,borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:priority===p.id?p.c+"20":"#F3F4F6",color:priority===p.id?p.c:"#6B7280" }}>{p.l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
        <button onClick={()=>onNavigate("customer-ticket-status")} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>
          Submit Ticket
        </button>
      </div>
    </div>
  );
}

// ─── 37. Customer: Ticket Status ─────────────────────────────────────────────
export function CustomerTicketStatusScreen({ onNavigate }: Props) {
  const tickets = [
    { id:"TKT-0482",subject:"Payment not reflected",status:"In Progress",priority:"High",date:"Jun 11" },
    { id:"TKT-0421",subject:"Loan application question",status:"Resolved",priority:"Medium",date:"May 25" },
    { id:"TKT-0380",subject:"Interest rate query",status:"Resolved",priority:"Low",date:"Apr 10" },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>My Tickets</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        <button onClick={()=>onNavigate("customer-create-ticket")} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,height:48,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:4 }}>
          + Submit New Ticket
        </button>
        {tickets.map((t,i)=>(
          <button key={i} onClick={()=>onNavigate("customer-ticket-details")} style={{ background:"white",borderRadius:14,padding:"14px 16px",border:"1px solid #F3F4F6",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",cursor:"pointer",textAlign:"left",width:"100%",display:"flex",flexDirection:"column",gap:8 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ fontSize:11,color:"#9CA3AF",fontWeight:600 }}>{t.id}</span>
              <span style={{ fontSize:10,fontWeight:700,color:t.status==="In Progress"?"#F59E0B":t.status==="Resolved"?"#10B981":"#0D5C3A",background:t.status==="In Progress"?"#FFF7ED":t.status==="Resolved"?"#F0FDF4":"#ECF5F0",padding:"2px 8px",borderRadius:20 }}>{t.status}</span>
            </div>
            <p style={{ fontSize:14,fontWeight:700,color:"#1F2937",margin:0 }}>{t.subject}</p>
            <div style={{ display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:11,color:"#9CA3AF" }}>{t.date}</span>
              <span style={{ fontSize:11,fontWeight:600,color:t.priority==="High"?"#EF4444":t.priority==="Medium"?"#F59E0B":"#10B981" }}>{t.priority} Priority</span>
            </div>
          </button>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 38. Customer: Ticket Details ────────────────────────────────────────────
export function CustomerTicketDetailsScreen({ onNavigate }: Props) {
  const [reply, setReply] = useState("");
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("customer-ticket-status")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <div style={{ marginLeft:12 }}>
          <span style={{ fontSize:16,fontWeight:700,color:"white",display:"block" }}>TKT-0482</span>
          <span style={{ fontSize:11,color:"rgba(255,255,255,0.7)" }}>Payment not reflected · In Progress</span>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12 }}>
        {[
          { from:"You",text:"I made a payment of UGX 92,083 on Jun 10 but it's not showing in my account. MTN reference: MTN-447821.",time:"Jun 11, 09:00 AM",isUser:true },
          { from:"Lisa (Support)",text:"Hi Amara! I've received your request. I'm looking into the MTN transaction now. Can you confirm the phone number used?",time:"Jun 11, 09:12 AM",isUser:false },
          { from:"You",text:"+256 770 123 456",time:"Jun 11, 09:15 AM",isUser:true },
          { from:"Lisa (Support)",text:"Thank you! I can see the transaction. It was delayed due to a network issue. Your account will be updated within 30 minutes.",time:"Jun 11, 09:20 AM",isUser:false },
        ].map((m,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:m.isUser?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"85%",padding:"10px 14px",borderRadius:m.isUser?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.isUser?"#0D5C3A":"white",boxShadow:"0 2px 6px rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize:11,fontWeight:700,color:m.isUser?"rgba(255,255,255,0.7)":"#6B7280",margin:"0 0 4px" }}>{m.from}</p>
              <p style={{ fontSize:13,color:m.isUser?"white":"#1F2937",margin:0,lineHeight:1.5 }}>{m.text}</p>
              <span style={{ fontSize:10,color:m.isUser?"rgba(255,255,255,0.6)":"#9CA3AF",display:"block",marginTop:4 }}>{m.time}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding:"10px 16px 20px",background:"white",borderTop:"1px solid #F3F4F6",display:"flex",gap:8 }}>
        <input value={reply} onChange={e=>setReply(e.target.value)} placeholder="Add a reply..." style={{ flex:1,height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,outline:"none" }}/>
        <button style={{ width:44,height:44,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Send size={16} color="white"/>
        </button>
      </div>
    </div>
  );
}

// ─── 39. Customer: WhatsApp Support ──────────────────────────────────────────
export function CustomerWhatsAppSupportScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"#25D366" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>WhatsApp Support</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 20px",gap:24 }}>
        <div style={{ width:88,height:88,borderRadius:44,background:"#25D366",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(37,211,102,0.3)" }}>
          <span style={{ fontSize:44 }}>💬</span>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Chat on WhatsApp</h2>
          <p style={{ fontSize:14,fontWeight:800,color:"#25D366",margin:"8px 0" }}>+256 700 123 456</p>
          <p style={{ fontSize:13,color:"#6B7280",lineHeight:1.6 }}>Our support team is available on WhatsApp Monday–Friday 8 AM–8 PM, Saturday 9 AM–5 PM.</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",flexDirection:"column",gap:10 }}>
          <p style={{ fontSize:12,fontWeight:700,color:"#374151",margin:0 }}>Quick message templates:</p>
          {["Hi, I have a question about my loan","My payment is not reflecting","I need help with my account","What is the interest rate?"].map((t,i)=>(
            <button key={i} style={{ padding:"10px 14px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0",color:"#065F46",fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left" }}>{t}</button>
          ))}
        </div>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"#25D366",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",boxShadow:"0 4px 12px rgba(37,211,102,0.3)" }}>
          Open WhatsApp
        </button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 40. Customer: Phone Support ─────────────────────────────────────────────
export function CustomerPhoneSupportScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Phone Support</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 20px",gap:20 }}>
        <div style={{ width:88,height:88,borderRadius:44,background:"#F0FDF4",border:"2px solid #A7F3D0",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Phone size={44} color="#10B981" strokeWidth={1.5}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Toll-Free Hotline</h2>
          <p style={{ fontSize:32,fontWeight:900,color:"#10B981",margin:"8px 0",letterSpacing:-1 }}>0800 123 456</p>
          <p style={{ fontSize:13,color:"#6B7280" }}>Free to call from any network · 24/7</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          {[["Hotline","0800 123 456 (Free)"],["WhatsApp","+256 700 123 456"],["Office","0414 123 456"],["Hours","24/7 for emergencies"],["Avg Wait","2 minutes"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#10B981,#059669)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",boxShadow:"0 4px 12px rgba(16,185,129,0.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
          <Phone size={20}/> Call 0800 123 456
        </button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 41. Customer: Email Support ─────────────────────────────────────────────
export function CustomerEmailSupportScreen({ onNavigate }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Email Support</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:14 }}>
        <div style={{ background:"#ECF5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #D2E9DD" }}>
          <p style={{ fontSize:12,color:"#083A24",margin:0 }}>📧 Sending to <strong>support@kuula.ug</strong> · Reply within 24 hours</p>
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:12 }}>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>From</label>
            <input value="amara.nakato@gmail.com" disabled style={{ width:"100%",height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,color:"#9CA3AF",background:"#F9FAFB",outline:"none",...S }}/>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Payment not reflecting in my account" style={{ width:"100%",height:44,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 14px",fontSize:13,outline:"none",...S }}/>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Message</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={7} placeholder="Describe your issue. Include your loan ID, dates, amounts, and MTN reference numbers if relevant." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",resize:"none",...S }}/>
          </div>
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
          <Send size={18}/> Send Email
        </button>
      </div>
    </div>
  );
}

// ─── 42. Customer: FAQ ───────────────────────────────────────────────────────
export function CustomerFAQScreen({ onNavigate }: Props) {
  const [open, setOpen] = useState<number|null>(null);
  const faqs = [
    { q:"How do I apply for a loan?",category:"Loans" },
    { q:"What is the interest rate?",category:"Loans" },
    { q:"How long does approval take?",category:"Loans" },
    { q:"How do I repay my loan?",category:"Payments" },
    { q:"Can I pay early without penalty?",category:"Payments" },
    { q:"How do I increase my credit limit?",category:"Credit" },
    { q:"What happens if I miss a payment?",category:"Payments" },
    { q:"How do I set up auto-payment?",category:"Payments" },
    { q:"How does savings interest work?",category:"Savings" },
    { q:"How do I reset my PIN?",category:"Account" },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>FAQ</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px" }}>
        <div style={{ background:"white",borderRadius:16,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          {faqs.map((faq,i)=>(
            <div key={i} style={{ borderBottom:i<faqs.length-1?"1px solid #F3F4F6":"none" }}>
              <button onClick={()=>setOpen(open===i?null:i)} style={{ width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left" }}>
                <span style={{ fontSize:10,fontWeight:700,color:"#9CA3AF",background:"#F3F4F6",padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap" }}>{faq.category}</span>
                <span style={{ fontSize:13,fontWeight:600,color:"#1F2937",flex:1 }}>{faq.q}</span>
                <ChevronRight size={14} color="#D1D5DB" style={{ transform:open===i?"rotate(90deg)":"none",transition:"transform 0.2s",flexShrink:0 }}/>
              </button>
              {open===i && (
                <div style={{ padding:"0 16px 14px" }}>
                  <p style={{ fontSize:12,color:"#6B7280",margin:0,lineHeight:1.7 }}>
                    {["Tap 'Apply for Loan' on your Home screen. Select your amount, repayment term, and purpose, then review and submit.","We charge simple interest at an all-inclusive APR of up to 33.6% per year (Uganda's UMRA cap). No compounding, no hidden fees.","Most applications are approved within 2–5 minutes. Complex cases may take up to 2 hours.","Pay via MTN MoMo or Airtel Money through the 'Make Payment' button on your loan screen.","Yes! Kuula charges zero early repayment penalty. Paying early saves you on interest.","Apply through Settings → Credit Limit Increase. Eligibility is based on your repayment history.","A one-time late fee within UMRA limits may apply (never compounded), and your credit score may be affected. Please contact us immediately.","Go to Settings → Payment Methods → Enable Auto-Pay and select your preferred MoMo account.","We pay 5.2% annual interest, credited monthly to your savings account.","Go to Settings → Privacy & Security → Change PIN."][i]}
                  </p>
                  <button onClick={()=>onNavigate("customer-faq-detail")} style={{ marginTop:10,padding:"6px 14px",borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Read Full Answer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 43. Customer: FAQ Detail ────────────────────────────────────────────────
export function CustomerFAQDetailScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("customer-faq")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>FAQ Detail</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px" }}>
        <div style={{ background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize:11,fontWeight:700,color:"#0D5C3A",background:"#ECF5F0",padding:"3px 10px",borderRadius:20 }}>Payments</span>
          <h2 style={{ fontSize:18,fontWeight:800,color:"#1F2937",margin:"12px 0" }}>How do I repay my loan?</h2>
          <p style={{ fontSize:13,color:"#374151",lineHeight:1.8 }}>
            Kuula offers multiple ways to repay your loan:
          </p>
          {["<strong>Via the App:</strong> Go to your Home screen → tap the active loan → tap 'Make Payment' → enter amount → choose MTN MoMo or Airtel Money → confirm.","<strong>MTN MoMo Menu:</strong> Dial *165# → Payments → Pay Bill → Enter Biller Code 123456 → Enter your Loan ID → Confirm with PIN.","<strong>Airtel Money:</strong> Dial *185# → Make Payments → Pay Bill → Kuula → Enter Loan ID → Confirm."].map((s,i)=>(
            <div key={i} style={{ display:"flex",gap:10,marginBottom:14 }}>
              <div style={{ width:24,height:24,borderRadius:12,background:"#0D5C3A",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2 }}>
                <span style={{ fontSize:11,fontWeight:700,color:"white" }}>{i+1}</span>
              </div>
              <p style={{ fontSize:13,color:"#374151",lineHeight:1.7,margin:0 }} dangerouslySetInnerHTML={{ __html:s }}/>
            </div>
          ))}
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#ECF5F0",border:"1px solid #D2E9DD",marginTop:16 }}>
            <p style={{ fontSize:12,color:"#083A24",margin:0 }}>💡 Tip: Enable Auto-Pay so you never miss a due date. Go to Settings → Auto-Payment.</p>
          </div>
        </div>
        <div style={{ marginTop:14,display:"flex",gap:10 }}>
          <button style={{ flex:1,height:46,borderRadius:12,background:"#F3F4F6",color:"#374151",border:"none",fontSize:13,fontWeight:600,cursor:"pointer" }}>Was this helpful? 👍</button>
          <button onClick={()=>onNavigate("customer-support-chat")} style={{ flex:1,height:46,borderRadius:12,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Chat with Us</button>
        </div>
      </div>
    </div>
  );
}

// ─── 44. Customer: Loan Guides ───────────────────────────────────────────────
export function CustomerLoanGuidesScreen({ onNavigate }: Props) {
  const guides = [
    { title:"How Loans Work",icon:"📋",time:"3 min read",desc:"Understanding loan terms, interest, and repayment" },
    { title:"How to Apply",icon:"✍️",time:"2 min read",desc:"Step-by-step guide to your first loan application" },
    { title:"Improving Your Score",icon:"⭐",time:"4 min read",desc:"Tips to boost your credit score for better rates" },
    { title:"Understanding Interest",icon:"💰",time:"2 min read",desc:"How your simple 33.6% APR interest is calculated" },
    { title:"Repayment Strategies",icon:"📅",time:"3 min read",desc:"Tips for managing repayments and avoiding penalties" },
    { title:"Using Auto-Payment",icon:"🔄",time:"1 min read",desc:"Set up automatic payments so you never miss a date" },
  ];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Loan Guides</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        {guides.map((g,i)=>(
          <button key={i} style={{ background:"white",borderRadius:14,padding:"14px 16px",border:"1px solid #F3F4F6",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",cursor:"pointer",textAlign:"left",display:"flex",gap:14,alignItems:"center",width:"100%" }}>
            <span style={{ fontSize:28,flexShrink:0 }}>{g.icon}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14,fontWeight:700,color:"#1F2937",margin:0 }}>{g.title}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:"3px 0 0" }}>{g.desc}</p>
              <span style={{ fontSize:10,color:"#9CA3AF" }}>{g.time}</span>
            </div>
            <ChevronRight size={14} color="#D1D5DB"/>
          </button>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 45. Customer: How to Pay ────────────────────────────────────────────────
export function CustomerHowToPayScreen({ onNavigate }: Props) {
  const [method, setMethod] = useState("app");
  const steps: Record<string, { s: string; icon: string }[]> = {
    app: [
      { s:"Open the Kuula app and go to Home", icon:"📱" },
      { s:"Tap on your active loan card", icon:"💳" },
      { s:"Tap the blue 'Make Payment' button", icon:"👆" },
      { s:"Enter the amount you want to pay", icon:"💰" },
      { s:"Select MTN MoMo or Airtel Money", icon:"📲" },
      { s:"Confirm the payment with your PIN", icon:"🔐" },
      { s:"Done! You'll receive a confirmation SMS", icon:"✅" },
    ],
    mtn: [
      { s:"Dial *165# on your MTN line", icon:"📞" },
      { s:"Select 4 - Payments", icon:"4️⃣" },
      { s:"Select 4 - Pay Bill", icon:"📋" },
      { s:"Enter Biller Code: 123456", icon:"🔢" },
      { s:"Enter your Loan ID (e.g. KUL-04821)", icon:"🆔" },
      { s:"Enter amount and confirm with PIN", icon:"🔐" },
      { s:"You'll receive a confirmation SMS", icon:"✅" },
    ],
  };
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("help-support")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>How to Pay</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px 16px 90px" }}>
        <div style={{ display:"flex",gap:8,marginBottom:16 }}>
          {[{id:"app",l:"📱 Via App"},{id:"mtn",l:"🟡 MTN USSD"}].map(m=>(
            <button key={m.id} onClick={()=>setMethod(m.id)} style={{ flex:1,height:42,borderRadius:12,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:method===m.id?"#0D5C3A":"white",color:method===m.id?"white":"#374151",boxShadow:"0 2px 6px rgba(0,0,0,0.06)" }}>{m.l}</button>
          ))}
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {(steps[method]||[]).map((s,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:14,background:"white",borderRadius:14,padding:"14px 16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <div style={{ width:36,height:36,borderRadius:10,background:"#ECF5F0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18 }}>{s.icon}</div>
              <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                <span style={{ fontSize:20,fontWeight:800,color:"#0D5C3A",lineHeight:1 }}>{i+1}</span>
                <p style={{ fontSize:13,color:"#374151",margin:0,lineHeight:1.5 }}>{s.s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 46-47: Admin Tickets already exist as admin-tickets, admin-ticket-detail ─
// ─── 48. Admin: Ticket Reply ─────────────────────────────────────────────────
export function AdminTicketReplyScreen({ onNavigate }: Props) {
  const [reply, setReply] = useState("");
  const [template, setTemplate] = useState("");
  const templates = ["Your payment has been confirmed and your account updated.","We are still investigating — please allow 24 hours.","Your issue has been resolved. Please check your account.","Please provide your MTN transaction ID for further assistance."];
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Reply to Ticket">
      <AdminPageHeader title="Reply — TKT-0482" subtitle="Amara Nakato · Payment not reflected"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 300px",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Customer's Message</h3>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#F8FAFC",marginBottom:16 }}>
            <p style={{ fontSize:13,color:"#374151",lineHeight:1.6,margin:0 }}>I made a payment of UGX 92,083 on Jun 10 but it's not showing in my account. MTN reference: MTN-447821. Please help urgently.</p>
          </div>
          <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Your Reply</label>
          <textarea value={reply||template} onChange={e=>setReply(e.target.value)} rows={6} placeholder="Type your response to the customer..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
          <div style={{ display:"flex",gap:10,marginTop:14 }}>
            <button onClick={()=>onNavigate("admin-tickets")} style={{ flex:1,height:44,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
              <Send size={15}/> Send Reply
            </button>
            <button style={{ flex:1,height:44,borderRadius:10,background:"#F0FDF4",color:"#10B981",border:"none",fontSize:13,fontWeight:700,cursor:"pointer" }}>Mark Resolved</button>
          </div>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:13,fontWeight:700,margin:"0 0 12px" }}>Quick Templates</h3>
          {templates.map((t,i)=>(
            <button key={i} onClick={()=>setTemplate(t)} style={{ width:"100%",padding:"9px 12px",borderRadius:8,background:"#F8FAFC",border:`1px solid ${template===t?"#0D5C3A":"#E2E8F0"}`,color:"#374151",fontSize:11,textAlign:"left",cursor:"pointer",marginBottom:8,lineHeight:1.4 }}>{t}</button>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 49. Admin: Ticket Escalation ────────────────────────────────────────────
export function AdminTicketEscalationScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Escalate Ticket">
      <AdminPageHeader title="Escalate Ticket — TKT-0482" subtitle="Escalate to senior support for complex issues"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA",marginBottom:16,display:"flex",gap:10 }}>
            <AlertTriangle size={16} color="#D97706" style={{ flexShrink:0,marginTop:2 }}/>
            <p style={{ fontSize:12,color:"#92400E",margin:0 }}>Escalating removes this ticket from your queue and assigns it to senior support. Use only for complex unresolved issues.</p>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {["Senior Support Agent","Technical Team","Finance Team","Management"].map((t,i)=>(
              <button key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",background:"white",cursor:"pointer" }}>
                <span style={{ fontSize:13,fontWeight:600,color:"#374151" }}>{t}</span>
                <ChevronRight size={14} color="#D1D5DB"/>
              </button>
            ))}
          </div>
          <div style={{ marginTop:14 }}>
            <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Escalation Reason</label>
            <textarea rows={3} placeholder="Explain why this needs escalation..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box" as "border-box",resize:"none" }}/>
          </div>
          <button style={{ width:"100%",height:44,marginTop:14,borderRadius:10,background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Escalate Ticket</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 50. Admin: Support Staff Dashboard ──────────────────────────────────────
export function AdminSupportStaffDashboardScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Support Staff Dashboard">
      <AdminPageHeader title="Support Staff Dashboard" subtitle="Agent performance and ticket distribution"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Open Tickets" value="12" color="#F59E0B" icon={<Clock size={18} color="#F59E0B"/>}/>
        <StatCard label="In Progress" value="8" color="#0D5C3A" icon={<></>}/>
        <StatCard label="Resolved Today" value="24" color="#10B981" icon={<CheckCircle size={18} color="#10B981"/>}/>
        <StatCard label="Avg Response" value="18 min" color="#8B5CF6" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Agent","Open","In Progress","Resolved Today","Avg Time","Rating"]}
        rows={[
          ["Lisa Namuddu","4","3","10","12 min","4.9/5"],
          ["James Opio","5","2","8","22 min","4.6/5"],
          ["Sarah Adeke","3","3","6","18 min","4.8/5"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 51. Admin: Support Analytics ────────────────────────────────────────────
export function AdminSupportAnalyticsScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-tickets" onNavigate={onNavigate} title="Support Analytics">
      <AdminPageHeader title="Support Analytics" subtitle="Performance metrics for customer support"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Avg Response Time" value="18 min" sub="Target: 30 min ✓" color="#10B981" icon={<Clock size={18} color="#10B981"/>}/>
        <StatCard label="Resolution Rate" value="94.2%" sub="This month" color="#0D5C3A" icon={<></>}/>
        <StatCard label="Customer Satisfaction" value="4.7/5" sub="From 312 ratings" color="#F59E0B" icon={<></>}/>
        <StatCard label="Tickets This Month" value="347" sub="+12% vs last month" color="#8B5CF6" icon={<></>}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Top Issue Categories</h3>
          {[["Payment issues","38%","#0D5C3A"],["Loan queries","24%","#10B981"],["Account access","18%","#F59E0B"],["Interest queries","12%","#8B5CF6"],["Other","8%","#94A3B8"]].map(([l,v,c])=>(
            <div key={l} style={{ marginBottom:10 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontSize:12,color:"#374151" }}>{l}</span>
                <span style={{ fontSize:12,fontWeight:700,color:c as string }}>{v}</span>
              </div>
              <div style={{ height:6,background:"#F3F4F6",borderRadius:3 }}>
                <div style={{ width:v,height:"100%",background:c as string,borderRadius:3 }}/>
              </div>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Response Time Trend</h3>
          {[["This week","18 min"],["Last week","22 min"],["This month avg","20 min"],["Best day","Mon (12 min)"],["Worst day","Fri (31 min)"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
