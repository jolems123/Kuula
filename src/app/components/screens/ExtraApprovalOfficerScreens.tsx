/**
 * Group 1 — Loan Approval Workflow + Officer Tracking (screens 1–18)
 * Admin: 1–12, 14–18  |  Customer: 13
 */

import React, { useState } from "react";
import { Check, X, ArrowRight, Phone, Mail, Clock, Star, AlertTriangle, ChevronRight, Plus, RefreshCw, User } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }
function ugx(n: number) { return "UGX " + n.toLocaleString(); }

// ─── 13. Customer: Officer Assigned (mobile) ──────────────────────────────────
export function CustomerOfficerAssignedScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("loan-approval")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Your Loan Officer</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px",display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ background:"white",borderRadius:20,padding:"24px",boxShadow:"0 4px 16px rgba(0,0,0,0.07)",display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center" }}>
          <div style={{ width:72,height:72,borderRadius:36,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(11,107,58,0.3)" }}>
            <span style={{ fontSize:28,fontWeight:800,color:"white" }}>AK</span>
          </div>
          <div>
            <p style={{ fontSize:18,fontWeight:800,color:"#1F2937",margin:0 }}>Alice Kabanda</p>
            <p style={{ fontSize:12,color:"#6B7280",margin:"4px 0" }}>Senior Loan Officer · Kuula</p>
            <span style={{ fontSize:11,fontWeight:700,color:"#12B984",background:"#F0FDF4",padding:"3px 12px",borderRadius:20 }}>● Currently Available</span>
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
        <button onClick={()=>onNavigate("loan-timeline")} style={{ width:"100%",height:48,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer" }}>
          View Loan Timeline
        </button>
      </div>
      <BottomNav active="loans" onNavigate={onNavigate}/>
    </div>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("loan-detail")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Loan Timeline</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 30px" }}>
        <div style={{ position:"relative",paddingLeft:28 }}>
          {steps.map((s,i)=>(
            <div key={i} style={{ position:"relative",marginBottom:24 }}>
              <div style={{ position:"absolute",left:-28,top:4,width:16,height:16,borderRadius:8,background:s.done?"#12B984":"#E5E7EB",border:"2px solid white",boxShadow:"0 0 0 2px #E2E8F0",display:"flex",alignItems:"center",justifyContent:"center" }}>
                {s.done && <Check size={9} color="white"/>}
              </div>
              {i<steps.length-1 && <div style={{ position:"absolute",left:-21,top:20,width:2,height:28,background:s.done?"#12B984":"#E5E7EB" }}/>}
              <div style={{ background:"white",borderRadius:12,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize:13,fontWeight:700,color:s.done?"#1F2937":"#9CA3AF",margin:0 }}>{s.label}</p>
                <p style={{ fontSize:11,color:s.done?"#12B984":"#D1D5DB",margin:"3px 0 0",fontWeight:s.done?600:400 }}>{s.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="loans" onNavigate={onNavigate}/>
    </div>
  );
}
