import { useEffect, useState } from "react";
import { api } from "../api/client";
interface Props { token:string; applicationId:string; applicationStatus:string; }
export function GuarantorStaffReview({token,applicationId,applicationStatus}:Props) {
  const [status,setStatus]=useState("loading");
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [collateral,setCollateral]=useState<Awaited<ReturnType<typeof api.getCollateralAssessment>>|null>(null);
  const [assetDescription,setAssetDescription]=useState("");
  const [ownershipEvidence,setOwnershipEvidence]=useState("");
  const [estimatedValue,setEstimatedValue]=useState("");
  const [inspectionNotes,setInspectionNotes]=useState("");
  const [verificationStatus,setVerificationStatus]=useState("pending");
  const refresh=async()=>{const result=await api.getGuarantorRequirement(token,applicationId);setStatus(result.requirement.status);};
  useEffect(()=>{let active=true;api.getGuarantorRequirement(token,applicationId).then(r=>{if(active)setStatus(r.requirement.status);}).catch(()=>{if(active)setStatus("unavailable");});return()=>{active=false;};},[applicationId,token]);
  useEffect(()=>{let active=true; api.getCollateralAssessment(token,applicationId).then(r=>{if(active){setCollateral(r);if(r.assessment){setAssetDescription(r.assessment.asset_description);setOwnershipEvidence(r.assessment.ownership_evidence);setEstimatedValue(String(r.assessment.estimated_value));setInspectionNotes(r.assessment.inspection_notes);setVerificationStatus(r.assessment.verification_status);}}}).catch(()=>{if(active)setCollateral(null)});return()=>{active=false}},[token,applicationId]);
  async function saveCollateral() {
    setBusy(true);setMessage("");
    try {
      await api.saveCollateralAssessment(token,applicationId,{assetDescription,ownershipEvidence,inspectionNotes,estimatedValue:Number(estimatedValue),verificationStatus});
      setCollateral(await api.getCollateralAssessment(token,applicationId));
      setMessage("Collateral assessment recorded in the audit history.");
    } catch(e){setMessage(e instanceof Error?e.message:"Collateral review failed");}
    finally{setBusy(false)}
  }
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
    <section aria-label="Collateral assessment" style={{marginTop:16,borderTop:"1px solid #D6E4DC",paddingTop:12,display:"grid",gap:8}}>
      <h3 style={{fontSize:15,fontWeight:800}}>Collateral inspection and ownership review</h3>
      <p style={{fontSize:12}}>Uploaded security photos: {collateral?.photos.length ?? "unavailable"}. A photo does not establish legal ownership or a perfected charge. Each review is retained as an audit record.</p>
      <label>Asset description<input className="kx-input" maxLength={1000} value={assetDescription} onChange={e=>setAssetDescription(e.target.value)} /></label>
      <label>Ownership documents and findings<textarea className="kx-input" rows={3} maxLength={1500} value={ownershipEvidence} onChange={e=>setOwnershipEvidence(e.target.value)} /></label>
      <label>Estimated value (UGX)<input className="kx-input" type="number" min="0" step="1" value={estimatedValue} onChange={e=>setEstimatedValue(e.target.value)} /></label>
      <label>Inspection findings<textarea className="kx-input" rows={3} maxLength={3000} value={inspectionNotes} onChange={e=>setInspectionNotes(e.target.value)} /></label>
      <label>Assessment decision<select className="kx-input" value={verificationStatus} onChange={e=>setVerificationStatus(e.target.value)}><option value="pending">Pending further evidence</option><option value="inspected">Inspected (not legally perfected)</option><option value="rejected">Rejected</option></select></label>
      <button type="button" disabled={busy||assetDescription.trim().length<10||ownershipEvidence.trim().length<10||inspectionNotes.trim().length<20||estimatedValue===""||!Number.isSafeInteger(Number(estimatedValue))} onClick={saveCollateral}>Record collateral assessment</button>
    </section>
    {message&&<p role="status" style={{fontSize:12}}>{message}</p>}
  </section>;
}
