import { useState } from "react";
import { api } from "../api/client";

export function GuarantorInvitationPage() {
  const token = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("token") ?? "";
  const [status,setStatus] = useState("");
  const [pending,setPending] = useState(false);
  async function respond(response:"interested"|"decline") {
    if (!/^[a-f0-9]{64}$/.test(token)) {setStatus("This invitation link is invalid.");return;}
    setPending(true);
    try {
      const result = await api.respondToGuarantorInvitation(token,response);
      setStatus(result.message);
      window.history.replaceState(null,"",window.location.pathname+"#/guarantor/invitation");
    } catch(e) {setStatus(e instanceof Error?e.message:"The invitation cannot be processed.");}
    finally {setPending(false);}
  }
  return <main style={{maxWidth:460,margin:"5vh auto",padding:24,background:"white",borderRadius:18}}>
    <h1 style={{color:"#0B5E3A",fontWeight:800}}>Kuula guarantor invitation</h1>
    <p>A Kuula customer has nominated you as a possible guarantor. This is only an invitation to express interest. You have no obligation to guarantee or repay a debt by using this page.</p>
    <p>Before any guarantee can exist, Kuula must independently verify you, disclose the full proposed terms, and obtain your separate legally valid acceptance. Do not share identity documents by message.</p>
    {status ? <p role="status">{status}</p> : <div style={{display:"grid",gap:12}}>
      <button type="button" disabled={pending || !token} onClick={()=>respond("interested")} className="kuula-primary">I am interested in learning more</button>
      <button type="button" disabled={pending || !token} onClick={()=>respond("decline")}>Decline invitation</button>
    </div>}
    <p style={{fontSize:12,color:"#68766F"}}>If you did not expect this invitation, you can decline or simply ignore it.</p>
  </main>;
}
