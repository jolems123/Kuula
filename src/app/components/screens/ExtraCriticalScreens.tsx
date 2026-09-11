/**
 * Group 6 — Critical Screens (82–100)
 * Customer: 82, 83, 84, 86, 93, 96, 97
 * Admin: 85, 87, 88, 89, 90, 91, 92, 94, 95, 98, 99, 100
 */

import React, { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, Shield, AlertTriangle, RefreshCw, Download, Server, Database, Activity, Lock } from "lucide-react";
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#12B984,#059669)" }}>
        <button onClick={()=>onNavigate("loan-approval")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Funds Sent!</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px",gap:20 }}>
        <div style={{ width:88,height:88,borderRadius:44,background:"#F0FDF4",border:"2px solid #12B984",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(16,185,129,0.25)" }}>
          <CheckCircle size={52} color="#12B984" strokeWidth={1.5}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Loan Disbursed!</h2>
          <p style={{ fontSize:32,fontWeight:900,color:"#12B984",margin:"8px 0" }}>UGX 500,000</p>
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
          <button onClick={()=>onNavigate("loan-detail")} style={{ flex:1,height:50,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer" }}>View Loan Details</button>
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
              <TrendingUp size={14} color="#12B984" style={{ flexShrink:0,marginTop:2 }}/>
              <p style={{ fontSize:12,color:"#374151",margin:0 }}>{r}</p>
            </div>
          ))}
        </div>
        <div style={{ display:"flex",gap:10,width:"100%" }}>
          <button onClick={()=>onNavigate("improve-credit")} style={{ flex:1,height:50,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer" }}>Improve Score</button>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("credit-dashboard")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Request Credit Limit Increase</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        {submitted ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,paddingTop:20 }}>
            <CheckCircle size={56} color="#12B984" strokeWidth={1.5}/>
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
                <div style={{ flex:1,textAlign:"center",padding:"12px",background:"var(--brand-light)",borderRadius:10,border:"1.5px solid var(--brand-border)" }}>
                  <p style={{ fontSize:11,color:"#6B7280",margin:0 }}>Requested</p>
                  <p style={{ fontSize:20,fontWeight:800,color:"var(--brand-primary)",margin:"4px 0" }}>{ugx(Number(requested))}</p>
                </div>
              </div>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Requested Limit (UGX)</label>
              <input type="number" value={requested} onChange={e=>setRequested(e.target.value)} style={{ width:"100%",height:50,borderRadius:10,border:"1.5px solid #E5E7EB",padding:"0 16px",fontSize:22,fontWeight:800,color:"var(--brand-primary)",outline:"none",...S }}/>
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                {[1500000,2000000,3000000].map(a=>(
                  <button key={a} onClick={()=>setRequested(String(a))} style={{ flex:1,height:34,borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:"var(--brand-light)",color:"var(--brand-primary)" }}>{ugx(a)}</button>
                ))}
              </div>
            </div>
            <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6 }}>Reason for Increase</label>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={4} placeholder="Explain why you need a higher credit limit..." style={{ width:"100%",borderRadius:10,border:"1.5px solid #E5E7EB",padding:"10px 14px",fontSize:13,outline:"none",resize:"none",...S }}/>
            </div>
            <div style={{ padding:"10px 14px",borderRadius:10,background:"var(--brand-light)",border:"1px solid var(--brand-border)" }}>
              <p style={{ fontSize:12,color:"#374151",margin:0 }}>💡 Your credit score of <strong>742</strong> makes you eligible for up to <strong>UGX 3,000,000</strong>.</p>
            </div>
          </>
        )}
      </div>
      {!submitted && (
        <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 36px",background:"white",borderTop:"1px solid #F3F4F6" }}>
          <button onClick={()=>setSubmitted(true)} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Submit Request</button>
        </div>
      )}
      {submitted && <BottomNav active="home" onNavigate={onNavigate}/>}
    </div>
  );
}

// ─── 86. Customer: Loan Refinance ────────────────────────────────────────────
export function CustomerLoanRefinanceScreen({ onNavigate }: Props) {
  const [term, setTerm] = useState(90);
  const balance = 276249;
  const newMonthly = Math.ceil(balance / (term / 30));
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("loan-detail")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Refinance Loan</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 130px",display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ background:"linear-gradient(135deg,var(--brand-light),var(--brand-border))",borderRadius:16,padding:"16px",border:"1px solid var(--brand-border)" }}>
          <p style={{ fontSize:12,color:"#6B7280",fontWeight:600,margin:0 }}>Current Remaining Balance</p>
          <p style={{ fontSize:28,fontWeight:900,color:"var(--brand-primary-dark)",margin:"4px 0" }}>{ugx(balance)}</p>
          <p style={{ fontSize:12,color:"#6B7280",margin:0 }}>KUL-2026-04821 · Original 30-day term</p>
        </div>
        <div style={{ background:"white",borderRadius:16,padding:"16px",boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize:13,fontWeight:700,color:"#1F2937",marginBottom:12 }}>Extend Repayment Term</p>
          <input type="range" min={30} max={180} step={30} value={term} onChange={e=>setTerm(Number(e.target.value))} style={{ width:"100%",accentColor:"var(--brand-primary)" }}/>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
            <span style={{ fontSize:11,color:"#9CA3AF" }}>30 days</span>
            <span style={{ fontSize:16,fontWeight:800,color:"var(--brand-primary)" }}>{term} days</span>
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
        <button style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Request Refinancing</button>
      </div>
    </div>
  );
}

// ─── 93. Customer: Re-verify Identity ────────────────────────────────────────
export function CustomerReverifyIdentityScreen({ onNavigate }: Props) {
  const [step, setStep] = useState(1);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("settings")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}><ArrowLeft size={18} color="white"/></button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Re-verify Identity</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:"20px 16px",gap:16 }}>
        <div style={{ background:"var(--brand-light)",borderRadius:12,padding:"14px",border:"1px solid var(--brand-border)" }}>
          <p style={{ fontSize:12,color:"#374151",margin:0 }}>🛡 UMRA regulations require identity re-verification every 6 months. This keeps your account secure.</p>
        </div>
        {[1,2,3].map(s=>(
          <div key={s} style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:14,background:step>=s?"var(--brand-light)":"white",border:`2px solid ${step===s?"var(--brand-primary)":step>s?"#12B984":"#E5E7EB"}` }}>
            <div style={{ width:32,height:32,borderRadius:16,background:step>s?"#12B984":step===s?"var(--brand-primary)":"#E5E7EB",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {step>s ? <CheckCircle size={16} color="white"/> : <span style={{ fontSize:12,fontWeight:700,color:step===s?"white":"#9CA3AF" }}>{s}</span>}
            </div>
            <div>
              <p style={{ fontSize:13,fontWeight:700,color:step>=s?"#1F2937":"#9CA3AF",margin:0 }}>{["Confirm Your NIN","Take a Fresh Selfie","Complete Verification"][s-1]}</p>
              <p style={{ fontSize:11,color:"#9CA3AF",margin:"2px 0 0" }}>{["Confirm your National ID number","Hold phone camera at face level","We verify with NIRA"][s-1]}</p>
            </div>
          </div>
        ))}
        <button onClick={()=>{ if(step<3) setStep(step+1); else onNavigate("settings"); }} style={{ height:52,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>
          {step<3?"Continue":"Complete Verification"}
        </button>
      </div>
      <BottomNav active="settings" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 96. Customer: Privacy Policy ────────────────────────────────────────────
export function CustomerPrivacyPolicyScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
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
            <p style={{ fontSize:12,color:"var(--brand-primary)",fontWeight:700,margin:0 }}>https://kuula.ug/privacy</p>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
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
            <p style={{ fontSize:12,color:"var(--brand-primary)",fontWeight:700,margin:0 }}>https://kuula.ug/terms</p>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"8px 0 0" }}>Questions? support@kuula.ug · 0800 123 456 (toll-free)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
