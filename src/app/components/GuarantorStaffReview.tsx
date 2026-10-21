import { useEffect, useState } from "react";
import { api } from "../api/client";
interface Props { token:string; applicationId:string; applicationStatus:string; }
export function GuarantorStaffReview({token,applicationId,applicationStatus}:Props) {
  const [status,setStatus]=useState("loading");
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=async()=>{const result=await api.getGuarantorRequirement(token,applicationId);setStatus(result.requirement.status);};
  useEffect(()=>{let active=true;api.getGuarantorRequirement(token,applicationId).then(r=>{if(active)setStatus(r.requirement.status);}).catch(()=>{if(active)setStatus("unavailable");});return()=>{active=false;};},[applicationId,token]);
  async function act(kind:"require"|"waive"|"verify") {
    setBusy(true);setMessage("");
    try {
      if(kind==="require") await api.requireGuarantor(token,applicationId,reason);
      else if(kind==="waive") await api.waiveGuarantor(token,applicationId,reason);
      else await api.verifyGuarantor(token,applicationId,reason);
      await refresh();setReason("");setMessage("Decision recorded. Check case audit history.");
    } catch(e){setMessage(e instanceof Error?e.message:"Could not complete guarantor review.");}
    finally{setBusy(false);}
  }
  return <section aria-label="Guarantor credit review" style={{border:"1px solid #D6E4DC",borderRadius:12,marginTop:16,padding:14}}>
    <h3 style={{fontSize:15,fontWeight:800}}>Guarantor credit review</h3>
    <p style={{fontSize:12}}>Current requirement: <strong>{status.replaceAll("_"," ")}</strong>. A nominated person must consent independently. Lending approval never substitutes for verified guarantor evidence.</p>
    <label style={{fontSize:12}}>Documented credit rationale or identity verification findings
      <textarea className="kx-input" rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe observed evidence and reason for the decision" style={{width:"100%"}} />
    </label>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
      {["pending","resubmitted"].includes(applicationStatus) && ["not_required","required","unavailable"].includes(status) && <button type="button" disabled={busy||reason.trim().length<20} onClick={()=>act("require")}>Require guarantor</button>}
      {status==="required" && ["pending","resubmitted"].includes(applicationStatus) && <button type="button" disabled={busy||reason.trim().length<30} onClick={()=>act("waive")}>Request independent waiver</button>}
      {status==="signed_pending_review" && applicationStatus==="offered" && <button type="button" disabled={busy||reason.trim().length<30} onClick={()=>act("verify")}>Confirm independent guarantor review</button>}
    </div>
    {message&&<p role="status" style={{fontSize:12}}>{message}</p>}
  </section>;
}
