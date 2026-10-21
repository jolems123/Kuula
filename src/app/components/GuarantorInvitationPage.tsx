import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { api } from "../api/client";

export function GuarantorInvitationPage() {
  const inviteToken = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("token") ?? "";
  const {state} = useAppContext();
  const accessToken = state.session.token;
  const [status,setStatus] = useState("");
  const [pending,setPending] = useState(false);
  const [terms,setTerms] = useState<Awaited<ReturnType<typeof api.guarantorTerms>>["terms"] | null>(null);
  const [signedName,setSignedName] = useState("");
  const [liability,setLiability] = useState(false);
  const [advice,setAdvice] = useState(false);
  async function respond(response:"interested"|"decline") {
    if (!/^[a-f0-9]{64}$/.test(inviteToken)) {setStatus("This invitation link is invalid.");return;}
    setPending(true);setStatus("");
    try {
      const result = await api.respondToGuarantorInvitation(inviteToken,response);
      setStatus(result.message);
      if(response==="decline") setTerms(null);
    } catch(e) {setStatus(e instanceof Error?e.message:"The invitation cannot be processed.");}
    finally {setPending(false);}
  }
  async function readTerms() {
    if (!accessToken) {setStatus("Sign in or create and verify your own Kuula account first, then reopen this link.");return;}
    setPending(true);setStatus("");
    try {const result=await api.guarantorTerms(accessToken,inviteToken);setTerms(result.terms);setSignedName(result.terms.identityName);}
    catch(e){setStatus(e instanceof Error?e.message:"Loan terms are not available.");}
    finally {setPending(false);}
  }
  async function sign() {
    if(!accessToken || !terms || !liability || !advice) return;
    setPending(true);setStatus("");
    try {
      const result=await api.signGuarantorUndertaking(accessToken,inviteToken,signedName);
      setStatus(result.message+" Confirmation: "+result.signatureHash.slice(0,12));
      setTerms(null);
    } catch(e) {setStatus(e instanceof Error?e.message:"Unable to record your acceptance.");}
    finally {setPending(false);}
  }
  return <main style={{maxWidth:500,margin:"5vh auto",padding:24,background:"white",borderRadius:18}}>
    <h1 style={{color:"#0B5E3A",fontWeight:800}}>Kuula guarantor invitation</h1>
    <p>Someone has nominated you as a possible guarantor. You have no obligation to guarantee or repay a debt merely by opening this page or expressing interest.</p>
    {!accessToken && <p>To examine and sign final loan terms, register or sign in with your own Kuula account and complete normal phone and identity verification. Reopen the invitation afterwards.</p>}
    {status && <p role="status">{status}</p>}
    {terms ? <section style={{display:"grid",gap:12}}>
      <h2>Review proposed liability</h2>
      <p>Borrower: {terms.borrower}</p>
      <p>Loan principal: UGX {terms.principal.toLocaleString()}</p>
      <p><strong>Maximum guarantee amount: UGX {terms.totalLiability.toLocaleString()}</strong></p>
      <p>Loan term: {terms.termDays} days</p>
      <p>{terms.disclosure}</p>
      <label>Type your verified legal name<input className="kx-input" value={signedName} onChange={e=>setSignedName(e.target.value)}/></label>
      <label><input type="checkbox" checked={liability} onChange={e=>setLiability(e.target.checked)}/> I understand the maximum potential liability and voluntarily agree to guarantee repayment under these terms.</label>
      <label><input type="checkbox" checked={advice} onChange={e=>setAdvice(e.target.checked)}/> I have been advised to seek independent legal advice and had the opportunity to do so.</label>
      <button type="button" className="kuula-primary" disabled={pending || !liability || !advice} onClick={sign}>Accept guarantor undertaking</button>
    </section> : <div style={{display:"grid",gap:12}}>
      <button type="button" disabled={pending || !inviteToken} onClick={()=>respond("interested")}>I am interested in learning more</button>
      <button type="button" disabled={pending || !inviteToken || !accessToken} onClick={readTerms} className="kuula-primary">Review final loan terms</button>
      <button type="button" disabled={pending || !inviteToken} onClick={()=>respond("decline")}>Decline invitation</button>
    </div>}
    <p style={{fontSize:12,color:"#68766F"}}>This is a separate voluntary undertaking. Never send your ID or password to a borrower.</p>
  </main>;
}
