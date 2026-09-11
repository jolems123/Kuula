/**
 * Group 2 — Notifications & Promotions (screens 19–33)
 */

import React, { useState } from "react";
import { Bell, Plus, Target, TrendingUp, Send, BarChart3, Gift, Tag, CheckCircle, ArrowLeft } from "lucide-react";
import { BottomNav } from "../BottomNav";
import { useTranslation } from "react-i18next";

interface Props { onNavigate: (s: string) => void; }

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
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
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
          <div key={i} style={{ background:n.read?"#F9FAFB":"white",borderRadius:14,padding:"14px 16px",border:n.read?"1px solid #F3F4F6":"1px solid var(--brand-border)",boxShadow:n.read?"none":"0 2px 8px rgba(11,107,58,0.07)",display:"flex",gap:12 }}>
            <span style={{ fontSize:24,flexShrink:0 }}>{n.icon}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13,fontWeight:n.read?600:700,color:"#1F2937",margin:0 }}>{n.title}</p>
              <p style={{ fontSize:12,color:"#6B7280",margin:"3px 0",lineHeight:1.4 }}>{n.body}</p>
              <span style={{ fontSize:10,color:"#9CA3AF" }}>{n.time}</span>
            </div>
            {!n.read && <div style={{ width:8,height:8,borderRadius:4,background:"var(--brand-primary)",flexShrink:0,marginTop:4 }}/>}
          </div>
        ))}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}

// ─── 31. Customer: Available Promotions (mobile) ──────────────────────────────
export function CustomerAvailablePromotionsScreen({ onNavigate }: Props) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#F9FAFB",paddingTop: 0 }}>
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("home")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Available Promotions</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px 16px 90px",display:"flex",flexDirection:"column",gap:14 }}>
        <p style={{ fontSize:13,color:"#6B7280" }}>You qualify for 2 exclusive promotions based on your profile.</p>
        {[
          { title:"First Loan Discount",desc:"Get 5% lower interest rate on your next loan",badge:"New",color:"#12B984",icon:"🎁",expires:"Aug 31, 2026" },
          { title:"High Score Reward",desc:"Your score of 742 unlocks an increased credit limit of UGX 2,000,000",badge:"Exclusive",color:"#8B5CF6",icon:"⭐",expires:"Jul 15, 2026" },
        ].map((p,i)=>(
          <div key={i} style={{ background:"white",borderRadius:20,padding:"20px",boxShadow:"0 4px 16px rgba(0,0,0,0.07)",border:`1px solid ${p.color}25` }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
              <span style={{ fontSize:32 }}>{p.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <p style={{ fontSize:15,fontWeight:800,color:"#1F2937",margin:0 }}>{p.title}</p>
                  <span style={{ fontSize:10,fontWeight:700,color:p.color,background:`color-mix(in srgb, ${p.color} 8%, transparent)`,padding:"2px 8px",borderRadius:20 }}>{p.badge}</span>
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
      <div style={{ display:"flex",alignItems:"center",padding:"16px 16px 14px",background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))" }}>
        <button onClick={()=>onNavigate("customer-available-promotions")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <ArrowLeft size={18} color="white"/>
        </button>
        <span style={{ fontSize:17,fontWeight:700,color:"white",marginLeft:12 }}>Claim Promotion</span>
      </div>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 20px",gap:20 }}>
        {claimed ? (
          <>
            <div style={{ width:80,height:80,borderRadius:40,background:"#F0FDF4",border:"2px solid #12B984",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <CheckCircle size={44} color="#12B984" strokeWidth={1.5}/>
            </div>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>Promotion Claimed! 🎉</h2>
              <p style={{ fontSize:13,color:"#6B7280",marginTop:8,lineHeight:1.6 }}>Your 5% discount has been applied to your account. It will be used automatically on your next loan application.</p>
            </div>
            <button onClick={()=>onNavigate("loan-apply")} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer" }}>Apply for Loan Now</button>
          </>
        ) : (
          <>
            <span style={{ fontSize:48 }}>🎁</span>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontSize:22,fontWeight:800,color:"#1F2937",margin:0 }}>First Loan Discount</h2>
              <p style={{ fontSize:32,fontWeight:900,color:"#12B984",margin:"8px 0" }}>5% OFF</p>
              <p style={{ fontSize:13,color:"#6B7280",lineHeight:1.6 }}>Interest rate discount on your first loan. Valid for 30 days from today. Maximum loan UGX 500,000.</p>
            </div>
            <div style={{ width:"100%",padding:"14px",borderRadius:14,background:"white",boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
              {[["Normal Rate","8% / month"],["Your Rate","7.6% / month"],["You Save","UGX 2,000 on UGX 500K"],["Expiry","Jul 11, 2026"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3F4F6" }}>
                  <span style={{ fontSize:12,color:"#6B7280" }}>{l}</span><span style={{ fontSize:12,fontWeight:700,color:"#1F2937" }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={()=>setClaimed(true)} style={{ width:"100%",height:52,borderRadius:14,background:"linear-gradient(135deg,#12B984,#059669)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",boxShadow:"0 4px 12px rgba(16,185,129,0.3)" }}>
              Claim This Offer
            </button>
          </>
        )}
      </div>
      <BottomNav active="home" onNavigate={onNavigate}/>
    </div>
  );
}
