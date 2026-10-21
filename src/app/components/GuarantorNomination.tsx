import { UiText, uiText } from "../../i18n/ui-text";
import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Props { applicationId: string; token: string; status: string; }
export function GuarantorNomination({ applicationId, token, status }: Props) {
  const [requirement, setRequirement] = useState("loading");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [permission, setPermission] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api.getGuarantorRequirement(token, applicationId)
      .then(({ requirement }) => { if (active) setRequirement(requirement.status); })
      .catch(() => { if (active) setRequirement("unavailable"); });
    return () => { active = false; };
  }, [applicationId, token]);
  if (!["pending", "resubmitted"].includes(status)) return null;
  if (requirement === "loading") return <p style={{fontSize:12}}><UiText text={"Checking guarantor requirements…"} /></p>;
  if (requirement === "not_required" || requirement === "waived") return null;
  if (requirement === "unavailable") return <p role="status" style={{fontSize:12}}><UiText text={"Guarantor status is temporarily unavailable."} /></p>;
  if (requirement === "verified") return <p style={{fontSize:12}}><UiText text={"Guarantor requirement reviewed."} /></p>;
  const submit = async () => {
    setMessage("");
    if (!permission) { setMessage("Confirm you have permission to share this contact."); return; }
    setSaving(true);
    try {
      const result = await api.nominateGuarantor(token, applicationId, { fullName, phone, relationship, permissionToContact: true });
      setMessage(result.deliveryAccepted ? "Invitation sent for review. No guarantee exists until independent verification and signing." : "Nomination saved, but SMS invitation delivery is not confirmed.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to nominate guarantor"); }
    finally { setSaving(false); }
  };
  return <section aria-label={uiText("Guarantor nomination")} style={{borderTop:"1px solid #E2EAE5",paddingTop:12,display:"grid",gap:8}}>
    <strong style={{color:"#184B32",fontSize:13}}><UiText text={"Guarantor requested by Kuula"} /></strong>
    <p style={{fontSize:12,margin:0}}><UiText text={"Nominate someone who has agreed to receive an invitation. Their participation is voluntary and does not create a debt obligation."} /></p>
    <label style={{fontSize:12}}><UiText text={"Full name"} /><input className="kx-input" value={fullName} maxLength={120} onChange={e=>setFullName(e.target.value)} /></label>
    <label style={{fontSize:12}}><UiText text={"Phone number"} /><input className="kx-input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
    <label style={{fontSize:12}}><UiText text={"Relationship"} /><input className="kx-input" value={relationship} maxLength={80} onChange={e=>setRelationship(e.target.value)} /></label>
    <label style={{fontSize:12,display:"flex",gap:8,alignItems:"flex-start"}}><input type="checkbox" checked={permission} onChange={e=>setPermission(e.target.checked)} /><UiText text={"I have this person's permission to share their contact information for an invitation."} /></label>
    <button type="button" disabled={saving || !permission} onClick={submit} className="kuula-primary"><UiText text={saving?"Sending…":"Invite guarantor"} /></button>
    {message && <p role="status" style={{fontSize:12}}><UiText text={message} /></p>}
  </section>;
}
