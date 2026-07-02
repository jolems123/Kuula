/**
 * Group 6 — Critical Screens (82–100)
 * Customer: 82, 83, 84, 86, 93, 96, 97
 * Admin: 85, 87, 88, 89, 90, 91, 92, 94, 95, 98, 99, 100
 */

import React, { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, Shield, AlertTriangle, RefreshCw, Download, Server, Database, Activity, Lock } from "lucide-react";
import { AdminLayout, AdminTable, StatusBadge, AdminPageHeader, AdminCard, StatCard } from "../AdminLayout";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
const S: React.CSSProperties = { boxSizing: "border-box" as "border-box" };
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

// ─── 82. Customer: Loan Disbursement Status ───────────────────────────────────
export function CustomerDisbursementStatusScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#10B981,#059669)" }}>
        <button onClick={()=>onNavigate("loan-approval")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Funds Sent!</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:88,height:88,borderRadius:44,background:"#F0FDF4",border:"2px solid #10B981",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(16,185,129,0.25)" }}>
          <CheckCircle size={52} color="#10B981" strokeWidth={1.5}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Loan Disbursed!</h2>
          <p style={{ fontSize:32,fontWeight:900,color:"#10B981",margin:"8px 0" }}>UGX 500,000</p>
          <p style={{ fontSize:13,color:"#6B7280" }}>Sent to MTN MoMo · +256 770 123 456</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          {[["Amount Sent",ugx(500000)],["To","MTN MoMo · +256 770 123 456"],["Transaction ID","MTN-TXN-2026-447821"],["Date","Jun 11, 2026 · 09:45 AM"],["Loan Reference","KUL-2026-04821"],["Repayment Due","Jul 11, 2026"],["Total to Repay",ugx(552500)]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex",gap:10,width:"100%" }}>
          <button onClick={()=>onNavigate("loan-detail")} style={{ flex:1,height:50,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer" }}>View Loan Details</button>
          <button onClick={()=>onNavigate("home")} style={{ flex:1,height:50,borderRadius:14,background:"#F3F4F6",color:"#374151",fontSize:14,fontWeight:600,border:"none",cursor:"pointer" }}>Go to Home</button>
        </div>
      </div>
      <BottomNav active="loans" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 83. Customer: Loan Rejection Screen ─────────────────────────────────────
export function CustomerLoanRejectionScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#FEF2F2",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"#EF4444" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Application Not Approved</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:80,height:80,borderRadius:40,background:"white",border:"2px solid #FECACA",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(239,68,68,0.2)" }}>
          <XCircle size={44} color="#EF4444" strokeWidth={1.5}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#991B1B",margin:0 }}>Loan Not Approved</h2>
          <p style={{ fontSize:13,color:"#B91C1C",margin:"8px 0",lineHeight:1.6 }}>We're sorry, we were unable to approve your application of <strong>UGX 500,000</strong> at this time.</p>
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#991B1B",marginBottom:10 }}>Reasons for Rejection:</p>
          {["Your requested amount exceeds your current credit limit (UGX 300,000)","Your credit score of 620 is below our minimum threshold of 650"].map((r,i)=>(
            <div key={i} style={{ display:"flex",gap:10,marginBottom:10 }}>
              <XCircle size={14} color="#EF4444" style={{ flexShrink:0,marginTop:2 }}/>
              <p style={{ fontSize:12,color:"#B91C1C",margin:0,lineHeight:1.5 }}>{r}</p>
            </div>
          ))}
        </div>
        <div style={{ width:"100%",background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#374151",marginBottom:10 }}>How to Improve Your Chances:</p>
          {["Repay existing loans on time to build credit history","Reduce your loan request to within your credit limit","Save regularly to demonstrate financial discipline","Wait 30 days before reapplying"].map((r,i)=>(
            <div key={i} style={{ display:"flex",gap:10,marginBottom:8 }}>
              <TrendingUp size={14} color="#10B981" style={{ flexShrink:0,marginTop:2 }}/>
              <p style={{ fontSize:12,color:"#374151",margin:0 }}>{r}</p>
            </div>
          ))}
        </div>
        <div style={{ display:"flex",gap:10,width:"100%" }}>
          <button onClick={()=>onNavigate("improve-credit")} style={{ flex:1,height:50,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer" }}>Improve Score</button>
          <button onClick={()=>onNavigate("loan-apply")} style={{ flex:1,height:50,borderRadius:14,background:"white",color:"#374151",fontSize:14,fontWeight:600,border:"1px solid #E5E7EB",cursor:"pointer" }}>Try Smaller Amount</button>
        </div>
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 84. Customer: Credit Limit Increase Request ──────────────────────────────
export function CustomerCreditLimitIncreaseScreen({ onNavigate }: Props) {
  const [requested, setRequested] = useState("1000000");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("credit-dashboard")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Request Credit Limit Increase</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        {submitted ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <CheckCircle size={56} color="#10B981" strokeWidth={1.5}/>
            <h2 style={{ fontSize:20,fontWeight:800,color:"#1F2937",textAlign:"center" }}>Request Submitted!</h2>
            <p style={{ fontSize:13,color:"#6B7280",textAlign:"center",lineHeight:1.6 }}>Your request to increase the credit limit to {ugx(Number(requested))} is under review. Decision within 24 hours.</p>
          </div>
        ) : (
          <>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex",gap:14,marginBottom:14 }}>
                <div style={{ flex:1,textAlign:"center",padding:"12px",background:"#F3F4F6",borderRadius:10 }}>
                  <p style={{ fontSize:11,color:"#9CA3AF",margin:0 }}>Current Limit</p>
                  <p style={{ fontSize:20,fontWeight:800,color:"#1F2937",margin:"4px 0" }}>{ugx(1500000)}</p>
                </div>
                <div style={{ display:"flex",alignItems:"center",fontSize:20 }}>→</div>
                <div style={{ flex:1,textAlign:"center",padding:"12px",background:"#ECF5F0",borderRadius:10,border:"1.5px solid #B6DCC8" }}>
                  <p style={{ fontSize:11,color:"#157A4E",margin:0 }}>Requested</p>
                  <p style={{ fontSize:20,fontWeight:800,color:"#0D5C3A",margin:"4px 0" }}>{ugx(Number(requested))}</p>
                </div>
              </div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Requested Limit (UGX)</label>
              <input type="number" value={requested} onChange={e=>setRequested(e.target.value)} style={{ width:"100%",height:50,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 16px",fontSize:22,fontWeight:800,color:"#0D5C3A",outline:"none",...S }}/>
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                {[1500000,2000000,3000000].map(a=>(
                  <button key={a} onClick={()=>setRequested(String(a))} style={{ flex:1,height:34,borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:"#ECF5F0",color:"#0D5C3A" }}>{ugx(a)}</button>
                ))}
              </div>
            </div>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Reason for Increase</label>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={4} placeholder="Explain why you need a higher credit limit..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",resize:"none",...S }}/>
            </div>
            <div style={{ padding:"10px 14px",borderRadius:10,background:"#ECF5F0",border:"1px solid #D2E9DD" }}>
              <p style={{ fontSize:12,color:"#083A24",margin:0 }}>💡 Your credit score of <strong>742</strong> makes you eligible for up to <strong>UGX 3,000,000</strong>.</p>
            </div>
          </>
        )}
      </div>
      {!submitted && (
        <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
          <button onClick={()=>setSubmitted(true)} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Submit Request</button>
        </div>
      )}
      {submitted && <BottomNav active="home" onNavigate={onNavigate}/>}
    </div>
  );
}

// ─── 85. Admin: Credit Limit Approval ────────────────────────────────────────
export function AdminCreditLimitApprovalScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Credit Limit Approval">
      <AdminPageHeader title="Credit Limit Increase Request" subtitle="Amara Nakato · Requesting UGX 500K → UGX 2,000,000"
        action={<div style={{ display:"flex",gap:8 }}>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#10B981",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Approve</button>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Deny</button>
        </div>}
      />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Request Details</h3>
          {[["Customer","Amara Nakato"],["Current Limit",ugx(1500000)],["Requested Amount",ugx(2000000)],["Increase",ugx(500000)],["Reason","Business expansion — buying stock"],["Requested On","Jun 11, 2026"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Eligibility Check</h3>
          {[["Credit Score","742 ✓ (min 650)"],["Payment History","100% on-time ✓"],["Active Loans","1 (within limit) ✓"],["Member Duration","2 years ✓"],["System Recommendation","APPROVE"],["Max Eligible",ugx(3000000)]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:v.includes("✓")||v==="APPROVE"?"#10B981":"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 86. Customer: Loan Refinance ────────────────────────────────────────────
export function CustomerLoanRefinanceScreen({ onNavigate }: Props) {
  const [term, setTerm] = useState(90);
  const balance = 276249;
  const newMonthly = Math.ceil(balance / (term / 30));
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("loan-detail")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Refinance Loan</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ background:"linear-gradient(135deg,#ECF5F0,#D2E9DD)",borderRadius:16,padding:"16px",border:"1px solid #B6DCC8" }}>
          <p style={{ fontSize:12,color:"#157A4E",fontWeight:600,margin:0 }}>Current Remaining Balance</p>
          <p style={{ fontSize:28,fontWeight:900,color:"#0A4A2E",margin:"4px 0" }}>{ugx(balance)}</p>
          <p style={{ fontSize:12,color:"#157A4E",margin:0 }}>KUL-2026-04821 · Original 30-day term</p>
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:12 }}>Extend Repayment Term</p>
          <input type="range" min={30} max={180} step={30} value={term} onChange={e=>setTerm(Number(e.target.value))} style={{ width:"100%",accentColor:"#0D5C3A" }}/>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
            <span style={{ fontSize:11,color:"#9CA3AF" }}>30 days</span>
            <span style={{ fontSize:16,fontWeight:800,color:"#0D5C3A" }}>{term} days</span>
            <span style={{ fontSize:11,color:"#9CA3AF" }}>180 days</span>
          </div>
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:10 }}>New Repayment Plan</p>
          {[["Balance Remaining",ugx(balance)],["New Term",`${term} days`],["New Monthly Payment",ugx(newMonthly)],["Additional Interest",ugx(Math.round(balance*0.336*(term/365)))],["Total Repayment",ugx(balance+Math.round(balance*0.336*(term/365)))]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Request Refinancing</button>
      </div>
    </div>
  );
}

// ─── 87. Admin: Loan Refinance Approval ──────────────────────────────────────
export function AdminRefinanceApprovalScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-active-loans" onNavigate={onNavigate} title="Refinance Approval">
      <AdminPageHeader title="Refinance Request — KUL-2026-04821" subtitle="Amara Nakato · Requesting 30→90 day extension"
        action={<div style={{ display:"flex",gap:8 }}>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#10B981",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Approve Extension</button>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Deny</button>
        </div>}
      />
      <AdminCard>
        {[["Original Term","30 days"],["Remaining Balance",ugx(276249)],["Requested New Term","90 days"],["New Monthly Payment",ugx(92083)],["Additional Interest",ugx(22100)],["Customer Credit Score","742 (Excellent)"],["Payment History","100% on-time"],["Risk Assessment","LOW"]].map(([l,v])=>(
          <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
            <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
          </div>
        ))}
      </AdminCard>
    </AdminLayout>
  );
}

// ─── 88. Admin: Risk Assessment ──────────────────────────────────────────────
export function AdminRiskAssessmentScreen({ onNavigate }: Props) {
  return <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Risk Assessment">
    <AdminPageHeader title="Risk Assessment — Amara Nakato" subtitle="Full risk profile and scoring"/>
    <div style={{ display:"flex",gap:14,marginBottom:20 }}>
      <StatCard label="Overall Risk" value="LOW" color="#10B981" icon={<Shield size={18} color="#10B981"/>}/>
      <StatCard label="Risk Score" value="82/100" sub="Higher = safer" color="#0D5C3A" icon={<></>}/>
      <StatCard label="Max Eligible" value={ugx(3000000)} color="#8B5CF6" icon={<></>}/>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
      <AdminCard>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Risk Factors</h3>
        {[["Payment History (35%)","92/100","#10B981"],["Credit Utilization (30%)","68/100","#157A4E"],["Income Stability (15%)","75/100","#F59E0B"],["Identity Verification (10%)","100/100","#10B981"],["Loan-to-Income Ratio (10%)","80/100","#8B5CF6"]].map(([l,v,c])=>(
          <div key={l} style={{ marginBottom:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
              <span style={{ fontSize:11,color:"#374151" }}>{l}</span>
              <span style={{ fontSize:11,fontWeight:700,color:c }}>{v}</span>
            </div>
            <div style={{ height:6,background:"#F3F4F6",borderRadius:3 }}>
              <div style={{ width:`${parseInt(v)}%`,height:"100%",background:c,borderRadius:3 }}/>
            </div>
          </div>
        ))}
      </AdminCard>
      <AdminCard>
        <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Risk Flags</h3>
        <div style={{ padding:"12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0",marginBottom:12 }}>
          <p style={{ fontSize:12,color:"#065F46",margin:0 }}>✓ No active risk flags</p>
        </div>
        <h3 style={{ fontSize:13,fontWeight:700,margin:"12px 0 8px" }}>Eligibility</h3>
        {[["Eligible for Loan","Yes ✓"],["Max Amount",ugx(3000000)],["Min Down Payment","None"],["Requires Manual Review","No"]].map(([l,v])=>(
          <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #F8FAFC" }}>
            <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:v.includes("✓")?"#10B981":"#0F172A" }}>{v}</span>
          </div>
        ))}
      </AdminCard>
    </div>
  </AdminLayout>;
}

// ─── 89-90. Admin: Block/Unblock already exist — add Unblock variant ──────────
export function AdminUnblockCustomerScreen({ onNavigate }: Props) {
  const [done, setDone] = useState(false);
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Unblock Customer">
      <AdminPageHeader title="Unblock Customer Account" subtitle="James Ssemakula · CUST-00250"/>
      <div style={{ maxWidth:500 }}>
        <AdminCard>
          <div style={{ padding:"12px 14px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FED7AA",marginBottom:16 }}>
            <p style={{ fontSize:12,color:"#92400E",margin:0 }}>Blocked Reason: "3 overdue loans, refused to pay" · Blocked Jun 1, 2026 by Alice Kabanda</p>
          </div>
          {[["Customer","James Ssemakula"],["Blocked On","Jun 1, 2026"],["Loans Cleared","All 3 overdue loans settled Jun 10"],["Outstanding Loans","None"],["New Credit Score","608 (Fair)"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
          {done ? (
            <div style={{ marginTop:16,padding:"12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A7F3D0",display:"flex",alignItems:"center",gap:8 }}>
              <CheckCircle size={18} color="#10B981"/>
              <span style={{ fontSize:13,fontWeight:700,color:"#065F46" }}>Account successfully unblocked.</span>
            </div>
          ) : (
            <button onClick={()=>setDone(true)} style={{ width:"100%",height:44,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#10B981,#059669)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>✓ Unblock Account</button>
          )}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 91. Admin: Fraud Detection ──────────────────────────────────────────────
export function AdminFraudDetectionScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Fraud Detection">
      <AdminPageHeader title="Fraud Detection" subtitle="Suspicious activity alerts and flagged accounts"
        action={<span style={{ padding:"6px 14px",borderRadius:20,background:"#FEF2F2",color:"#EF4444",fontSize:12,fontWeight:700,border:"1px solid #FECACA" }}>3 Active Flags</span>}
      />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Active Flags" value="3" color="#EF4444" icon={<AlertTriangle size={18} color="#EF4444"/>}/>
        <StatCard label="Resolved This Month" value="12" color="#10B981" icon={<></>}/>
        <StatCard label="Under Investigation" value="2" color="#F59E0B" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Customer","Flag Type","Severity","Detected","Status","Action"]}
        rows={[
          ["Richard Kato","Multiple login locations","High","Jun 10",<StatusBadge status="active"/>,<button onClick={()=>onNavigate("admin-fraud-investigation")} style={{ padding:"4px 10px",borderRadius:6,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Investigate</button>],
          ["Grace Mugo","Unusual loan application pattern","Medium","Jun 9",<StatusBadge status="active"/>,<button style={{ padding:"4px 10px",borderRadius:6,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Investigate</button>],
          ["David Ochieng","Duplicate NIN attempt","High","Jun 8",<StatusBadge status="pending"/>,<button style={{ padding:"4px 10px",borderRadius:6,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:11,fontWeight:600,cursor:"pointer" }}>Review</button>],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 92. Admin: Fraud Investigation ──────────────────────────────────────────
export function AdminFraudInvestigationScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-customer-list" onNavigate={onNavigate} title="Fraud Investigation">
      <AdminPageHeader title="Fraud Investigation — Richard Kato" subtitle="Case: FRAUD-2026-003 · Multiple login locations"
        action={<div style={{ display:"flex",gap:8 }}>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#EF4444",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Freeze Account</button>
          <button style={{ padding:"8px 14px",borderRadius:8,background:"#10B981",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Clear Flag</button>
        </div>}
      />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Alert Details</h3>
          {[["Alert Type","Multiple login locations"],["Severity","High"],["First Detected","Jun 10, 2026 · 11:32 PM"],["Login Locations","Kampala + Gulu (simultaneous)"],["Device","iPhone + Android (different)"],["Status","Under Investigation"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
            </div>
          ))}
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 12px" }}>Investigation Notes</h3>
          <textarea rows={6} placeholder="Document investigation findings..." style={{ width:"100%",borderRadius:8,border:"1.5px solid #E5E7EB",padding:"10px 12px",fontSize:13,outline:"none",resize:"none",...S }}/>
          <div style={{ display:"flex",gap:8,marginTop:12 }}>
            <button style={{ flex:1,height:38,borderRadius:8,background:"#ECF5F0",color:"#0D5C3A",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Contact Customer</button>
            <button style={{ flex:1,height:38,borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>Escalate to Legal</button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 93. Customer: Re-verify Identity ────────────────────────────────────────
export function CustomerReverifyIdentityScreen({ onNavigate }: Props) {
  const [step, setStep] = useState(1);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Re-verify Identity</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:"20px 16px",gap:16 }}>
        <div style={{ background:"#ECF5F0",borderRadius:12,padding:"14px",border:"1px solid #D2E9DD" }}>
          <p style={{ fontSize:12,color:"#083A24",margin:0 }}>🛡 UMRA regulations require identity re-verification every 6 months. This keeps your account secure.</p>
        </div>
        {[1,2,3].map(s=>(
          <div key={s} style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:14,background:step>=s?"#ECF5F0":"white",border:`2px solid ${step===s?"#0D5C3A":step>s?"#10B981":"#E5E7EB"}` }}>
            <div style={{ width:32,height:32,borderRadius:16,background:step>s?"#10B981":step===s?"#0D5C3A":"#E5E7EB",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {step>s ? <CheckCircle size={16} color="white"/> : <span style={{ fontSize:12,fontWeight:700,color:step===s?"white":"#9CA3AF" }}>{s}</span>}
            </div>
            <div>
              <p style={{ fontSize:13,fontWeight:700,color:step>=s?"#1F2937":"#9CA3AF",margin:0 }}>{["Confirm Your NIN","Take a Fresh Selfie","Complete Verification"][s-1]}</p>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>{["Confirm your National ID number","Hold phone camera at face level","We verify with NIRA"][s-1]}</p>
            </div>
          </div>
        ))}
        <button onClick={()=>{ if(step<3) setStep(step+1); else onNavigate("settings"); }} style={{ height:52,borderRadius:14,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>
          {step<3?"Continue":"Complete Verification"}
        </button>
      </div>
      <BottomNav active="settings" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 94. Admin: Compliance Report ────────────────────────────────────────────
export function AdminComplianceReportScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-compliance" onNavigate={onNavigate} title="Compliance Report">
      <AdminPageHeader title="UMRA Compliance Report — June 2026"
        action={<button style={{ padding:"8px 14px",borderRadius:8,background:"#0D5C3A",color:"white",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Download size={14}/>Export PDF</button>}
      />
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="KYC Verified" value="93.9%" sub="3,612/3,847" color="#10B981" icon={<></>}/>
        <StatCard label="AML Checks" value="100%" sub="All transactions" color="#0D5C3A" icon={<></>}/>
        <StatCard label="Data Encrypted" value="100%" color="#8B5CF6" icon={<></>}/>
        <StatCard label="Violations" value="0" color="#10B981" icon={<></>}/>
      </div>
      <AdminTable
        columns={["Requirement","Status","Last Checked","Notes"]}
        rows={[
          ["KYC for all customers",<StatusBadge status="approved"/>,"Jun 11, 2026","93.9% verified · 235 pending"],
          ["AML transaction monitoring",<StatusBadge status="approved"/>,"Real-time","All transactions screened"],
          ["Data encryption at rest",<StatusBadge status="approved"/>,"Jun 1, 2026","AES-256 encryption"],
          ["Data retention (10 years)",<StatusBadge status="approved"/>,"Jun 1, 2026","Policy enforced"],
          ["Credit bureau reporting",<StatusBadge status="approved"/>,"Monthly","CRB Uganda reporting active"],
          ["License renewal",<StatusBadge status="approved"/>,"Dec 31, 2026","UMRA/MDI/2021/047 valid"],
          ["Annual audit",<StatusBadge status="pending"/>,"Aug 2026","Scheduled with Ernst & Young"],
        ].map(r=>r.map((c,i)=>typeof c==="string"?<span key={i}>{c}</span>:c))}
      />
    </AdminLayout>
  );
}

// ─── 95. Admin: Data Retention Settings ──────────────────────────────────────
export function AdminDataRetentionScreen({ onNavigate }: Props) {
  const [years, setYears] = useState("7");
  return (
    <AdminLayout activeScreen="admin-compliance" onNavigate={onNavigate} title="Data Retention">
      <AdminPageHeader title="Data Retention Settings" subtitle="Configure how long customer data is stored"/>
      <div style={{ maxWidth:560 }}>
        <AdminCard style={{ marginBottom:14 }}>
          <div style={{ padding:"10px 14px",borderRadius:10,background:"#ECF5F0",border:"1px solid #D2E9DD",marginBottom:16 }}>
            <p style={{ fontSize:12,color:"#083A24",margin:0 }}>📋 UMRA requires Kuula to retain customer loan records for a minimum of <strong>10 years</strong> from the date of last transaction.</p>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:10 }}>Retention Period (years)</label>
            <div style={{ display:"flex",gap:10 }}>
              {["5","7","10"].map(y=>(
                <button key={y} onClick={()=>setYears(y)} style={{ flex:1,height:56,borderRadius:12,border:"none",cursor:"pointer",fontSize:22,fontWeight:900,background:years===y?"#0D5C3A":"#F3F4F6",color:years===y?"white":"#374151" }}>{y}</button>
              ))}
            </div>
          </div>
          {[
            {label:"Loan Records",val:years+" years"},
            {label:"KYC Documents",val:years+" years"},
            {label:"Transaction Logs",val:years+" years"},
            {label:"Communication Logs",val:"3 years"},
            {label:"Audit Trails",val:"10 years (minimum)"},
          ].map(({label,val})=>(
            <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F8FAFC" }}>
              <span style={{ fontSize:12,color:"#64748B" }}>{label}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{val}</span>
            </div>
          ))}
          <button style={{ width:"100%",height:44,marginTop:16,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:14,fontWeight:700,cursor:"pointer" }}>Save Retention Policy</button>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

// ─── 96. Customer: Privacy Policy ────────────────────────────────────────────
export function CustomerPrivacyPolicyScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("about-app")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Privacy Policy</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px" }}>
        <div style={{ background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ textAlign:"center",borderBottom:"1px solid #F3F4F6",paddingBottom:12 }}>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:0 }}>KUULA MICROFINANCE LIMITED</p>
            <h2 style={{ fontSize:18,fontWeight:800,color:"#1F2937",margin:"4px 0" }}>Privacy Policy</h2>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:0 }}>Effective: January 1, 2024 · Last updated: Jun 11, 2026</p>
          </div>
          {[
            { title:"1. Information We Collect", body:"We collect information you provide when creating your account (name, NIN, phone, email), transaction data (loan amounts, repayment history), device information (device ID, OS version), and location data (only when explicitly permitted)." },
            { title:"2. How We Use Your Information", body:"We use your data to process loan applications, assess creditworthiness, disburse funds, collect repayments, improve our services, and comply with regulatory requirements from UMRA and the Bank of Uganda." },
            { title:"3. Data Sharing", body:"We share data with: Uganda Registration Services Bureau (NIRA) for identity verification, MTN and Airtel for payment processing, Uganda Credit Reference Bureau for credit reporting, and regulatory authorities when legally required." },
            { title:"4. Data Security", body:"All data is encrypted using AES-256 encryption at rest and TLS 1.3 in transit. We conduct regular security audits and penetration testing." },
            { title:"5. Your Rights", body:"You have the right to access, correct, or delete your personal data. Contact us at privacy@kuula.ug or call 0800 123 456." },
            { title:"6. Account Deletion", body:"You can delete your account at any time from Settings → Privacy & Security → Delete Account. Some records are retained where Ugandan financial regulations (UMRA / AML) require it." },
            { title:"7. Children's Privacy", body:"Kuula is intended for users aged 18 and above. We do not knowingly collect data from minors." },
          ].map(({title,body})=>(
            <div key={title}>
              <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",margin:"0 0 6px" }}>{title}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:0,lineHeight:1.7 }}>{body}</p>
            </div>
          ))}
          <div style={{ borderTop:"1px solid #F3F4F6", paddingTop:12, marginTop:4, textAlign:"center" }}>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"0 0 4px" }}>This policy is also published at:</p>
            <p style={{ fontSize:12,color:"#0D5C3A",fontWeight:700,margin:0 }}>https://kuula.ug/privacy</p>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"8px 0 0" }}>Questions? privacy@kuula.ug · 0800 123 456 (toll-free)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 97. Customer: Terms of Service ──────────────────────────────────────────
export function CustomerTermsScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)" }}>
        <button onClick={()=>onNavigate("about-app")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Terms of Service</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px" }}>
        <div style={{ background:"white",borderRadius:16,padding:"20px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ textAlign:"center",borderBottom:"1px solid #F3F4F6",paddingBottom:12 }}>
            <h2 style={{ fontSize:18,fontWeight:800,color:"#1F2937",margin:0 }}>Terms of Service</h2>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"4px 0 0" }}>Kuula Microfinance Limited · Last updated Jun 11, 2026</p>
          </div>
          {[
            { title:"1. Eligibility", body:"You must be at least 18 years old, a Ugandan citizen or resident, and hold a valid National ID (NIN) to use Kuula's services." },
            { title:"2. Loan Terms", body:"All loans use simple interest at an all-inclusive APR of up to 33.6% per year — the maximum allowed under Uganda's UMRA regulations and within Apple's lending limits. Interest is never compounded and there are no hidden service fees. A late payment may attract a one-time fee within UMRA limits; penalties are never compounded." },
            { title:"3. Prohibited Activities", body:"You may not provide false information, use loan funds for illegal activities, attempt to defraud Kuula or other users, or create multiple accounts." },
            { title:"4. Account Suspension", body:"Kuula reserves the right to suspend accounts for repeated defaults, fraudulent activity, or violation of these terms." },
            { title:"5. Account Deletion", body:"You may delete your account at any time from Settings → Privacy & Security → Delete Account. Loan records required by UMRA / AML regulations will be retained for the legally mandated period." },
            { title:"6. Governing Law", body:"These terms are governed by the laws of Uganda and the microfinance regulations set by the Bank of Uganda and UMRA." },
          ].map(({title,body})=>(
            <div key={title}>
              <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",margin:"0 0 4px" }}>{title}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:0,lineHeight:1.7 }}>{body}</p>
            </div>
          ))}
          <div style={{ borderTop:"1px solid #F3F4F6", paddingTop:12, marginTop:4, textAlign:"center" }}>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"0 0 4px" }}>These terms are also published at:</p>
            <p style={{ fontSize:12,color:"#0D5C3A",fontWeight:700,margin:0 }}>https://kuula.ug/terms</p>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"8px 0 0" }}>Questions? support@kuula.ug · 0800 123 456 (toll-free)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 98. Admin: Audit Log ────────────────────────────────────────────────────
export function AdminAuditLogScreen({ onNavigate }: Props) {
  return (
    <AdminLayout activeScreen="admin-compliance" onNavigate={onNavigate} title="Audit Log">
      <AdminPageHeader title="Audit Log" subtitle="All system actions performed by staff members"/>
      <AdminTable
        columns={["Timestamp","Officer","Action","Details","IP Address"]}
        rows={[
          ["Jun 11 09:44","Alice Kabanda","Loan Approved","KUL-04821 · UGX 500,000","197.157.12.34"],
          ["Jun 11 09:42","Alice Kabanda","Loan Assigned","KUL-04821 → Alice Kabanda","197.157.12.34"],
          ["Jun 11 09:41","System","Loan Application","KUL-04821 received","—"],
          ["Jun 11 08:00","System","Auto-Collection","42 collections initiated","—"],
          ["Jun 10 17:23","Brian Ssali","Customer Blocked","James Ssemakula · 3 overdues","197.157.12.89"],
          ["Jun 10 14:05","Christine Ajok","Settings Changed","Interest rate: 8% → 8%","197.157.12.12"],
          ["Jun 10 11:30","Alice Kabanda","Loan Rejected","KUL-04818 · Low credit score","197.157.12.34"],
        ]}
      />
    </AdminLayout>
  );
}

// ─── 99. Admin: System Health ────────────────────────────────────────────────
export function AdminSystemHealthScreen({ onNavigate }: Props) {
  const services = [
    { name:"MTN MoMo API",status:"Operational",latency:"124ms",uptime:"99.9%",color:"#10B981" },
    { name:"Airtel Money API",status:"Operational",latency:"98ms",uptime:"99.7%",color:"#10B981" },
    { name:"NIRA (KYC) API",status:"Degraded",latency:"2,340ms",uptime:"97.2%",color:"#F59E0B" },
    { name:"Database",status:"Operational",latency:"8ms",uptime:"100%",color:"#10B981" },
    { name:"Credit Bureau API",status:"Operational",latency:"234ms",uptime:"99.5%",color:"#10B981" },
    { name:"SMS Gateway",status:"Operational",latency:"45ms",uptime:"99.8%",color:"#10B981" },
    { name:"Push Notifications",status:"Operational",latency:"67ms",uptime:"99.9%",color:"#10B981" },
  ];
  return (
    <AdminLayout activeScreen="admin-settings" onNavigate={onNavigate} title="System Health">
      <AdminPageHeader title="System Health Monitor" subtitle="Real-time status of all integrations and services"/>
      <div style={{ display:"flex",gap:14,marginBottom:20 }}>
        <StatCard label="Services Up" value="6/7" color="#10B981" icon={<Server size={18} color="#10B981"/>}/>
        <StatCard label="System Uptime" value="99.8%" sub="Last 30 days" color="#0D5C3A" icon={<Activity size={18} color="#0D5C3A"/>}/>
        <StatCard label="NIRA API" value="Degraded" color="#F59E0B" icon={<AlertTriangle size={18} color="#F59E0B"/>}/>
        <StatCard label="Avg Latency" value="417ms" color="#8B5CF6" icon={<></>}/>
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        {services.map(s=>(
          <AdminCard key={s.name}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:10,height:10,borderRadius:5,background:s.color,flexShrink:0 }}/>
              <p style={{ fontSize:14,fontWeight:700,color:"#0F172A",margin:0,flex:1 }}>{s.name}</p>
              <span style={{ fontSize:12,fontWeight:700,color:s.color,background:s.color+"15",padding:"3px 12px",borderRadius:20 }}>{s.status}</span>
              <span style={{ fontSize:12,color:"#64748B",minWidth:80,textAlign:"right" }}>Latency: {s.latency}</span>
              <span style={{ fontSize:12,color:"#64748B",minWidth:80,textAlign:"right" }}>Uptime: {s.uptime}</span>
            </div>
          </AdminCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// ─── 100. Admin: Backup & Restore ────────────────────────────────────────────
export function AdminBackupRestoreScreen({ onNavigate }: Props) {
  const [backing, setBacking] = useState(false);
  const [backed, setBacked] = useState(false);
  return (
    <AdminLayout activeScreen="admin-settings" onNavigate={onNavigate} title="Backup & Restore">
      <AdminPageHeader title="Backup & Restore" subtitle="Manage database backups and disaster recovery"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 14px" }}>Manual Backup</h3>
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {[["Last Backup","Jun 11, 2026 · 2:00 AM"],["Backup Size","2.4 GB"],["Location","AWS S3 Uganda"],["Retention","90 days"],["Encryption","AES-256"]].map(([l,v])=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F8FAFC" }}>
                <span style={{ fontSize:12,color:"#64748B" }}>{l}</span><span style={{ fontSize:12,fontWeight:600,color:"#0F172A" }}>{v}</span>
              </div>
            ))}
            {backed ? (
              <div style={{ padding:"10px",borderRadius:8,background:"#F0FDF4",border:"1px solid #A7F3D0",display:"flex",alignItems:"center",gap:8 }}>
                <CheckCircle size={16} color="#10B981"/>
                <span style={{ fontSize:12,fontWeight:700,color:"#065F46" }}>Backup complete! Saved to AWS S3.</span>
              </div>
            ) : (
              <button onClick={()=>{ setBacking(true); setTimeout(()=>{ setBacking(false); setBacked(true); },3000); }} style={{ height:42,borderRadius:10,background:"linear-gradient(135deg,#0D5C3A,#0A4A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
                {backing ? <><Database size={14} style={{ animation:"spin 1s linear infinite" }}/>Backing up...</> : <><Download size={14}/>Run Backup Now</>}
              </button>
            )}
          </div>
        </AdminCard>
        <AdminCard>
          <h3 style={{ fontSize:14,fontWeight:700,margin:"0 0 14px" }}>Backup Schedule</h3>
          {[{label:"Daily Full Backup",time:"2:00 AM",status:"Active"},{label:"Hourly Incremental",time:"Every hour",status:"Active"},{label:"Weekly Archive",time:"Sundays 3:00 AM",status:"Active"},{label:"Monthly Offsite",time:"1st of month",status:"Active"}].map(b=>(
            <div key={b.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F8FAFC" }}>
              <div>
                <p style={{ fontSize:12,fontWeight:600,color:"#0F172A",margin:0 }}>{b.label}</p>
                <p style={{ fontSize:10,color:"#94A3B8",margin:0 }}>{b.time}</p>
              </div>
              <StatusBadge status={b.status.toLowerCase()}/>
            </div>
          ))}
          <button style={{ width:"100%",height:38,marginTop:14,borderRadius:8,background:"#FEF2F2",color:"#EF4444",border:"none",fontSize:12,fontWeight:700,cursor:"pointer" }}>⚠ Restore from Backup</button>
        </AdminCard>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </AdminLayout>
  );
}
