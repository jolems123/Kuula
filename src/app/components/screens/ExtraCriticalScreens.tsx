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
export function CustomerPrivacyPolicyScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0B5E3A,#064A2E)" }}>
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
            <p style={{ fontSize:12,color:"#0B5E3A",fontWeight:700,margin:0 }}>https://kuula.ug/privacy</p>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,#0B5E3A,#064A2E)" }}>
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
            <p style={{ fontSize:12,color:"#0B5E3A",fontWeight:700,margin:0 }}>https://kuula.ug/terms</p>
            <p style={{ fontSize:11,color:"#9CA3AF",margin:"8px 0 0" }}>Questions? support@kuula.ug · 0800 123 456 (toll-free)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 98. Admin: Audit Log ────────────────────────────────────────────────────
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
                <CheckCircle size={16} color="#178654"/>
                <span style={{ fontSize:12,fontWeight:700,color:"#065F46" }}>Backup complete! Saved to AWS S3.</span>
              </div>
            ) : (
              <button onClick={()=>{ setBacking(true); setTimeout(()=>{ setBacking(false); setBacked(true); },3000); }} style={{ height:42,borderRadius:10,background:"linear-gradient(135deg,#0B5E3A,#064A2E)",color:"white",border:"none",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
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
