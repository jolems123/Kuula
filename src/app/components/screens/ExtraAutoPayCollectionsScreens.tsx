/**
 * Group 4 — Auto Payment (52–65) + Group 5 — Loan Collections (66–81)
 */

import React, { useState } from "react";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Phone, MessageSquare, FileText, Users, TrendingUp, Clock, Scale } from "lucide-react";
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment Setup</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        {done ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <div style={{ width:80,height:80,borderRadius:40,background:"#F0FDF4",border:"2px solid #12B984",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <CheckCircle size={44} color="#12B984" strokeWidth={1.5}/>
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
            <div style={{ background:"linear-gradient(135deg,var(--brand-light),var(--brand-border))",borderRadius:16,padding:"16px",border:"1px solid var(--brand-border)" }}>
              <h3 style={{ fontSize:15,fontWeight:800,color:"var(--brand-primary-dark)",margin:"0 0 6px" }}>Never Miss a Payment</h3>
              <p style={{ fontSize:12,color:"#374151",margin:0,lineHeight:1.6 }}>Auto-Payment deducts your loan repayment automatically on the due date from your linked MoMo account. No manual action needed.</p>
            </div>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <p style={{ fontSize:14,fontWeight:700,color:"#1F2937",margin:0 }}>Enable Auto-Payment</p>
                  <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>Automatically pay loans on due date</p>
                </div>
                <button onClick={()=>setEnabled(!enabled)} style={{ width:50,height:28,borderRadius:14,background:enabled?"var(--brand-primary)":"#D1D5DB",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:enabled?"flex-end":"flex-start",padding:3 }}>
                  <div style={{ width:22,height:22,borderRadius:11,background:"white" }}/>
                </button>
              </div>
              {enabled && (
                <>
                  <div>
                    <p style={{ fontSize:12,fontWeight:600,color:"#374151",marginBottom:8 }}>Deduct From</p>
                    {[{id:"mtn",l:"MTN MoMo · +256 770 123 456",logo:"🟡"},{id:"airtel",l:"Airtel Money · +256 752 987 654",logo:"🔴"}].map((m,i)=>(
                      <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"var(--brand-light)",border:"1.5px solid var(--brand-primary)",marginBottom:6 }}>
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
          <button onClick={()=>{ if(enabled) setDone(true); }} style={{ width:"100%",height:52,borderRadius:14,background:enabled?"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))":"#E5E7EB",color:enabled?"white":"#9CA3AF",fontSize:16,fontWeight:700,border:"none",cursor:enabled?"pointer":"not-allowed" }}>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment Settings</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 120px",display:"flex",flexDirection:"column",gap:14 }}>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:10 }}>Collection Timing</p>
          {[{id:"early",l:"3 days before due date"},{id:"due",l:"On due date at 8:00 AM"},{id:"late",l:"1 day after due date (grace period)"}].map(t=>(
            <button key={t.id} onClick={()=>setTiming(t.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`2px solid ${timing===t.id?"var(--brand-primary)":"#E5E7EB"}`,background:timing===t.id?"var(--brand-light)":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${timing===t.id?"var(--brand-primary)":"#D1D5DB"}`,background:timing===t.id?"var(--brand-primary)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {timing===t.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>{t.l}</span>
            </button>
          ))}
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:10 }}>Payment Amount</p>
          {[{id:"full",l:"Full outstanding balance"},{id:"min",l:"Minimum due only"},{id:"custom",l:"Custom amount"}].map(a=>(
            <button key={a.id} onClick={()=>setMaxAmt(a.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`2px solid ${maxAmt===a.id?"var(--brand-primary)":"#E5E7EB"}`,background:maxAmt===a.id?"var(--brand-light)":"white",cursor:"pointer",marginBottom:8,textAlign:"left" }}>
              <div style={{ width:16,height:16,borderRadius:8,border:`2px solid ${maxAmt===a.id?"var(--brand-primary)":"#D1D5DB"}`,background:maxAmt===a.id?"var(--brand-primary)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {maxAmt===a.id&&<div style={{ width:6,height:6,borderRadius:3,background:"white" }}/>}
              </div>
              <span style={{ fontSize:13,color:"#374151" }}>{a.l}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Save Settings</button>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Payment History</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 16px 90px",display:"flex",flexDirection:"column",gap:10 }}>
        {history.map((h,i)=>(
          <div key={i} style={{ background:"white",borderRadius:14,padding:"14px 16px",border:"1px solid #F3F4F6",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:14 }}>
            <div style={{ width:40,height:40,borderRadius:12,background:h.status==="success"?"#F0FDF4":"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {h.status==="success" ? <CheckCircle size={20} color="#12B984"/> : <XCircle size={20} color="#EF4444"/>}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",margin:0 }}>Auto-Payment · {h.method}</p>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>{h.date}</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:14,fontWeight:800,color:h.status==="success"?"#12B984":"#EF4444",margin:0 }}>{ugx(h.amount)}</p>
              <span style={{ fontSize:10,color:h.status==="success"?"#12B984":"#EF4444",fontWeight:600 }}>{h.status==="success"?"✓ Success":"✗ Failed"}</span>
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

// ─── 62-65: remaining autopay screens ────────────────────────────────────────
export function CustomerAutoPayLinkScreen({ onNavigate }: Props) {
  return <CustomerAutoPaySetupScreen onNavigate={onNavigate}/>;
}
export function CustomerAutoPayNotificationScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Auto-Pay Alert</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:72,height:72,borderRadius:36,background:"var(--brand-light)",border:"2px solid var(--brand-border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36 }}>🔔</div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:20,fontWeight:800,color:"#1F2937",margin:0 }}>Auto-Payment Reminder</h2>
          <p style={{ fontSize:13,color:"#6B7280",marginTop:8,lineHeight:1.7 }}>Your loan payment of <strong>UGX 92,083</strong> will be automatically deducted from your <strong>MTN MoMo (+256 770 123 456)</strong> tomorrow, <strong>Jun 25, 2026 at 8:00 AM</strong>.</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:14,padding:"14px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:12,color:"#374151",margin:"0 0 8px",fontWeight:600 }}>Please ensure you have sufficient balance:</p>
          <p style={{ fontSize:18,fontWeight:900,color:"#12B984",margin:0 }}>UGX 92,083</p>
          <p style={{ fontSize:11,color:"#9CA3AF",margin:"4px 0 0" }}>Available: UGX 234,000 · ✓ Sufficient</p>
        </div>
        <button onClick={()=>onNavigate("customer-autopay-settings")} style={{ width:"100%",height:48,borderRadius:14,background:"#F3F4F6",color:"#374151",fontSize:14,fontWeight:600,border:"none",cursor:"pointer" }}>Change Settings</button>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

export function CustomerRepaymentOfferScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
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
        <button onClick={()=>onNavigate("customer-accept-plan")} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#12B984,#059669)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Review & Accept Plan</button>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("customer-repayment-offer")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Accept Repayment Plan</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:"20px 20px 120px",gap:16 }}>
        {done ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <CheckCircle size={56} color="#12B984" strokeWidth={1.5}/>
            <h2 style={{ fontSize:21,fontWeight:800,color:"#1F2937",textAlign:"center" }}>Plan Accepted!</h2>
            <p style={{ fontSize:13,color:"#6B7280",textAlign:"center",lineHeight:1.6 }}>Your first payment of UGX 20,000 is due <strong>Jul 20, 2026</strong>. Auto-pay has been enabled.</p>
            <button onClick={()=>onNavigate("home")} style={{ width:"100%",height:50,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>Back to Home</button>
          </div>
        ) : (
          <>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize:13,color:"#374151",lineHeight:1.7 }}>By accepting, I agree to pay <strong>UGX 20,000 per month for 6 months</strong> starting July 20, 2026. Missed payments will resume normal overdue penalties.</p>
            </div>
            <button onClick={()=>setAgreed(!agreed)} style={{ display:"flex",alignItems:"center",gap:12,padding:"14px",background:"white",borderRadius:12,border:`2px solid ${agreed?"#12B984":"#E5E7EB"}`,cursor:"pointer",textAlign:"left" }}>
              <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${agreed?"#12B984":"#D1D5DB"}`,background:agreed?"#12B984":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {agreed&&<CheckCircle size={14} color="white"/>}
              </div>
              <span style={{ fontSize:12,color:"#374151",lineHeight:1.5 }}>I agree to these repayment terms and authorise auto-collection from my MTN MoMo account.</span>
            </button>
            <button onClick={()=>{ if(agreed) setDone(true); }} style={{ width:"100%",height:52,borderRadius:14,background:agreed?"linear-gradient(135deg,#12B984,#059669)":"#E5E7EB",color:agreed?"white":"#9CA3AF",fontSize:16,fontWeight:700,border:"none",cursor:agreed?"pointer":"not-allowed" }}>
              I Agree — Accept Plan
            </button>
          </>
        )}
      </div>
      {!done&&<BottomNav active="home" onNavigate={onNavigate}/>}
    </div>
  );
}
