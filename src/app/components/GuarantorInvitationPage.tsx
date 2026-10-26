import { UiText } from "../../i18n/ui-text";
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
  const [otpCode,setOtpCode] = useState("");
  const [otpVerified,setOtpVerified] = useState(false);
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
  async function requestSignatureCode() {
    if(!accessToken)return;
    setPending(true);setStatus("");
    try {const result=await api.requestGuarantorSignatureCode(accessToken,inviteToken);setStatus(result.message);setOtpVerified(false);}
    catch(e){setStatus(e instanceof Error?e.message:"Could not send code.");}
    finally{setPending(false);}
  }
  async function verifySignatureCode() {
    if(!accessToken)return;
    setPending(true);setStatus("");
    try {const result=await api.verifyGuarantorSignatureCode(accessToken,inviteToken,otpCode);setStatus(result.message);setOtpVerified(true);}
    catch(e){setStatus(e instanceof Error?e.message:"Code verification failed.");}
    finally{setPending(false);}
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
    <h1 style={{color:"#0B5E3A",fontWeight:800}}><UiText text={"Kuula guarantor invitation"} /></h1>
    <p><UiText text={"Someone has nominated you as a possible guarantor. You have no obligation to guarantee or repay a debt merely by opening this page or expressing interest."} /></p>
    <section aria-label="Guarantor identity photographs" style={{border:"1px solid #D6E4DC",borderRadius:12,padding:12,marginBottom:12}}><strong>Required identity photographs</strong><p style={{fontSize:13}}>Before signing, use your own Kuula account to capture a clear portrait, the front of your National ID, and the back of your National ID through the secure Identity Verification screen. An authorized officer must verify all three. The borrower must not upload your ID for you.</p><p style={{fontSize:12}}>These images remain in Kuula’s protected KYC storage. Your documents are not shared with the borrower.</p></section>
    {!accessToken && <p><UiText text={"To examine and sign final loan terms, register or sign in with your own Kuula account and complete normal phone and identity verification. Reopen the invitation afterwards."} /></p>}
    {status && <p role="status"><UiText text={status} /></p>}
    {terms ? <section style={{display:"grid",gap:12}}>
      <h2><UiText text={"Review proposed liability"} /></h2>
      <p><UiText text={"Borrower: "} />{terms.borrower}</p>
      <p><UiText text={"Loan principal: UGX "} />{terms.principal.toLocaleString()}</p>
      <p><strong><UiText text={"Maximum guarantee amount: UGX "} />{terms.totalLiability.toLocaleString()}</strong></p>
      <p><UiText text={"Loan term: "} />{terms.termDays}<UiText text={" days"} /></p>
      <p>{terms.disclosure}</p>
      <label><UiText text={"Type your verified legal name"} /><input className="kx-input" value={signedName} onChange={e=>setSignedName(e.target.value)}/></label>
      <label><input type="checkbox" checked={liability} onChange={e=>setLiability(e.target.checked)}/><UiText text={" I understand the maximum potential liability and voluntarily agree to guarantee repayment under these terms."} /></label>
      <label><input type="checkbox" checked={advice} onChange={e=>setAdvice(e.target.checked)}/><UiText text={" I have been advised to seek independent legal advice and had the opportunity to do so."} /></label>
      <button type="button" disabled={pending || !liability || !advice} onClick={requestSignatureCode}><UiText text={"Send signature verification SMS"} /></button>
      <label><UiText text={"SMS verification code"} /><input className="kx-input" inputMode="numeric" maxLength={6} value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/[^0-9]/g,""))}/></label>
      <button type="button" disabled={pending || otpCode.length!==6} onClick={verifySignatureCode}><UiText text={"Verify signature code"} /></button>
      <button type="button" className="kuula-primary" disabled={pending || !liability || !advice || !otpVerified} onClick={sign}><UiText text={"Accept guarantor undertaking"} /></button>
    </section> : <div style={{display:"grid",gap:12}}>
      <button type="button" disabled={pending || !inviteToken} onClick={()=>respond("interested")}><UiText text={"I am interested in learning more"} /></button>
      <button type="button" disabled={pending || !inviteToken || !accessToken} onClick={readTerms} className="kuula-primary"><UiText text={"Review final loan terms"} /></button>
      <button type="button" disabled={pending || !inviteToken} onClick={()=>respond("decline")}><UiText text={"Decline invitation"} /></button>
    </div>}
    <p style={{fontSize:12,color:"#68766F"}}><UiText text={"This is a separate voluntary undertaking. Never send your ID or password to a borrower."} /></p>
  </main>;
}
