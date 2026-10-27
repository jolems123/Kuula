import { LocalizedFileInput } from "../LocalizedFileInput";
import { UiText, uiText } from "../../../i18n/ui-text";
import { AlertCircle, ArrowRight, Camera, CheckCircle, Shield, User, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";
import { AuthLayout } from "../auth/AuthLayout";

interface Props { onNavigate: (screen: string) => void; }
type ImageSide = "front" | "back" | "portrait";
type Pictures = Record<ImageSide, File | null>;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Phone cameras often save HEIC or 5-15 MB photos. These are converted before upload.
const CONVERTIBLE_TYPES = new Set([...ALLOWED_TYPES, "image/heic", "image/heif", ""]);
const MAX_EDGE_PX = 2000;
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo format could not be opened")); };
    image.src = url;
  });
}

/**
 * Keeps ID photos readable (longest side up to 2000 px) while bringing large camera
 * images under the upload limit. Small JPG/PNG/WEBP files are sent unchanged.
 */
async function prepareIdPhoto(file: File): Promise<File> {
  if (ALLOWED_TYPES.has(file.type) && file.size <= RESIZE_ABOVE_BYTES) return file;
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device could not prepare the photo");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.88, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
    }
  }
  throw new Error("This photo is too large even after resizing");
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image"));
    reader.onerror = () => reject(new Error("Could not read this image"));
    reader.readAsDataURL(file);
  });
}

/** Browser or native webview camera capture. Photos remain in memory until submission. */
export function PhotoField({ kind, label, hint, file, onPick, busy = false, disabled = false }: {
  kind: ImageSide; label: string; hint: string; file: File | null; onPick: (side: ImageSide, file: File | null) => void; busy?: boolean; disabled?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onPick(kind, selected);
    e.target.value = "";
  };
  return (
    <div className="kx-field" style={{ display: "block", border: "1px solid #D5E8DA", borderRadius: 14, padding: 13, background: "rgba(255,255,255,.08)" }}>
      <label htmlFor={`kyc-photo-${kind}`} className="kx-label" style={{ display: "flex", alignItems: "center", gap: 7 }}><Camera size={16} /><UiText text={label} /></label>
      <span className="kx-hint" style={{ display: "block", margin: "5px 0 9px" }}><UiText text={hint} /></span>
      <LocalizedFileInput id={`kyc-photo-${kind}`} type="file" name={kind} disabled={disabled} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture={kind === "portrait" ? "user" : "environment"}
        onChange={change} aria-label={uiText(label)} style={{ maxWidth: "100%", fontSize: 13 }} />
      {preview && <img src={preview} alt={label + " preview"} style={{ width: "100%", maxHeight: 170, objectFit: "contain", marginTop: 10, borderRadius: 10 }} />}
      {file && <span className="kx-hint" style={{ display: "block", marginTop: 7 }}><UiText text={"Selected · "} />{(file.size / 1024 / 1024).toFixed(2)}<UiText text={" MB"} /></span>}
      {busy && <span className="kx-hint" role="status"><UiText text={"Preparing photo…"} /></span>}
      {(file || busy) && <button type="button" className="kx-btn kx-btn--secondary" style={{ marginTop: 10 }} disabled={disabled} aria-label={uiText(`Remove ${label}`)} onClick={() => onPick(kind, null)}><Trash2 size={16} /><UiText text={"Remove photo"} /></button>}
    </div>
  );
}

export function KycScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const [idNumber, setIdNumber] = useState(() => isValidUgandaNin(state.user?.nationalId ?? "") ? state.user!.nationalId : "");
  const [fullName, setFullName] = useState(state.user?.fullName ?? "");
  const [dob, setDob] = useState(state.user?.dateOfBirth?.slice(0, 10) ?? "");
  const [step, setStep] = useState(1);
  const [pictures, setPictures] = useState<Pictures>({ front: null, back: null, portrait: null });
  const photoVersions = useRef<Record<ImageSide, number>>({ front: 0, back: 0, portrait: 0 });
  const [preparing, setPreparing] = useState<Record<ImageSide, boolean>>({ front: false, back: false, portrait: false });
  const preparingPhotos = Object.values(preparing).some(Boolean);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submissionVersion, setSubmissionVersion] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    let live = true;
    api.getKycStatus(token).then(({ kyc }) => {
      if (!live) return;
      const current = String(kyc.status ?? "");
      setStatus(current);
      setSubmissionVersion(typeof kyc.version === "number" ? kyc.version : null);
      const legacyPending = current === "pending" && kyc.method === "smile-id";
      if ((current === "pending" && !legacyPending) || current === "verified") setStep(3);
      if (legacyPending) setRejectionReason("The previous identity capture service was retired. Use the new photo upload instead.");
      if (current === "rejected") { setStep(1); setRejectionReason(String(kyc.decisionReason ?? "Your document photographs need to be retaken.")); }
    }).catch(() => {
      if (live) setError("Could not check identity status. You can still enter your details.");
    }).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [token]);

  const selectPhoto = async (side: ImageSide, file: File | null) => {
    if (submitting) return;
    const version = ++photoVersions.current[side];
    setError("");
    setPreparing(previous => ({ ...previous, [side]: Boolean(file) }));
    if (!file) { setPictures(previous => ({ ...previous, [side]: null })); return; }
    try {
      if (!CONVERTIBLE_TYPES.has(file.type) || file.size < 32) throw new Error("unsupported");
      const prepared = await prepareIdPhoto(file);
      if (photoVersions.current[side] !== version) return;
      if (!ALLOWED_TYPES.has(prepared.type) || prepared.size > MAX_BYTES) throw new Error("too large");
      setPictures(previous => ({ ...previous, [side]: prepared }));
    } catch {
      if (photoVersions.current[side] !== version) return;
      setError("This photo could not be used. Take it again, or choose a JPG or PNG photo.");
    } finally {
      if (photoVersions.current[side] === version) setPreparing(previous => ({ ...previous, [side]: false }));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || checking || preparingPhotos) return;
    setError("");
    if (!token) { setError("Please sign in again to submit your identity documents."); return; }
    if (step === 1) {
      if (!isValidUgandaNin(idNumber)) { setError("Enter the 14-character NIN from your Uganda National ID."); return; }
      if (fullName.trim().length < 2) { setError("Enter your full legal name."); return; }
      const birthday = new Date(dob + "T00:00:00.000Z");
      if (!dob || Number.isNaN(birthday.getTime()) || birthday.toISOString().slice(0, 10) !== dob) {
        setError("Enter your correct date of birth."); return;
      }
      setStep(2);
      return;
    }
    if (step === 3) { onNavigate("home"); return; }
    const { front, back, portrait } = pictures;
    if (!front || !back || !portrait) { setError("Capture the front and back of your National ID and a clear portrait photo."); return; }
    if (!photoConsent) { setError("Please consent to the secure processing of these identity photographs."); return; }
    setSubmitting(true);
    try {
      const [frontImage, backImage, portraitImage] = await Promise.all([readImage(front), readImage(back), readImage(portrait)]);
      const result = await api.submitKycDocuments(token, {
        nationalId: normalizeNin(idNumber), fullName: fullName.trim(), dob, frontImage, backImage, portraitImage, photoConsent: true,
      });
      setStatus(result.kyc.status);
      setPictures({ front: null, back: null, portrait: null });
      setRejectionReason("");
      setSubmissionVersion(previous => previous === null ? 1 : previous + 1);
      setStep(3);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send your documents. Check the connection and try again.");
    } finally { setSubmitting(false); }
  };

  return (
    <AuthLayout onBack={() => {
      if (submitting) return;
      setError("");
      if (step === 2) setStep(1);
      else onNavigate("home");
    }} backLabel={step === 2 ? "Back to ID details" : "Back to dashboard"}>
      <div className="kx-steps" aria-label={uiText(`Step ${step} of 3`)}>
        <div className="kx-steps__bars" aria-hidden="true">
          {[1, 2, 3].map(n => <span key={n} className={step >= n ? "is-done" : ""} />)}
        </div><UiText text={" Step "} />{step}<UiText text={" of 3 "} /></div>
      <form onSubmit={submit} noValidate aria-busy={submitting || checking}>
        <div className="kx-auth-head">
          <div className="kx-auth-head__icon" aria-hidden="true">
            {step === 1 ? <User size={22} /> : step === 2 ? <Camera size={22} /> : <CheckCircle size={22} />}
          </div>
          <h2><UiText text={step === 1 ? "Confirm your National ID" : step === 2 ? "Capture your ID and portrait" : status === "verified" ? "Identity verified" : "Documents submitted"} /></h2>
          <p><UiText text={step === 1 ? "Enter the details printed on your Uganda National ID." : step === 2 ? "Photograph the front and back of the original card, then take a clear portrait of yourself." : status === "verified" ? "Your identity verification has been completed." : "Your photographs are securely submitted for review by an authorized Kuula officer."} /></p>
        </div>
        {step === 1 && <>
          {status === "rejected" && <section className="kuula-kyc-resubmit" aria-label="Identity verification rejected" role="status">
            <div className="kuula-kyc-resubmit__header"><RefreshCcw size={21} /><div><h3>Identity verification rejected</h3><p>{submissionVersion ? `Submission ${submissionVersion} needs replacement documents.` : "Your identity documents need to be submitted again."}</p></div></div>
            <div className="kuula-kyc-resubmit__reason"><strong>Reason provided by the reviewer</strong><p>{rejectionReason || "The identity review was not approved. Please capture and submit a new set of clear photographs."}</p></div>
            <p><strong>Resubmission checklist:</strong> You must replace all three photographs, even if only one photo was rejected.</p>
            <ul><li>Front of your original National ID — all corners and writing visible</li><li>Back of your National ID — sharp and without glare</li><li>A new portrait — face clearly visible in good lighting</li></ul>
            <button type="button" className="kx-btn kx-btn--primary" onClick={() => { setError(""); setStep(2); }}>Resubmit all documents</button>
            <p className="kuula-kyc-resubmit__note">You may first correct your National ID number, legal name or date of birth in the fields below. The new upload will be reviewed independently.</p>
          </section>}
          <div className="kx-field"><label htmlFor="kyc-nin" className="kx-label"><UiText text={"National ID number (NIN)"} /></label>
            <input id="kyc-nin" className="kx-input" value={idNumber} maxLength={14} autoComplete="off" onChange={e => setIdNumber(normalizeNin(e.target.value))} placeholder={uiText("14-character NIN")} /></div>
          <div className="kx-field"><label htmlFor="kyc-name" className="kx-label"><UiText text={"Full legal name"} /></label>
            <input id="kyc-name" className="kx-input" value={fullName} maxLength={120} autoComplete="name" onChange={e => setFullName(e.target.value)} /></div>
          <div className="kx-field"><label htmlFor="kyc-dob" className="kx-label"><UiText text={"Date of birth"} /></label>
            <input id="kyc-dob" className="kx-input" type="date" value={dob} onChange={e => setDob(e.target.value)} autoComplete="bday" /></div>
        </>}
        {step === 2 && <div className="kx-auth-stack">
          {status === "rejected" && <div className="kx-alert kx-alert--info" role="status">Replacement submission: upload a fresh National ID front, back and portrait. All three are required.</div>}
          <div className="kx-alert kx-alert--info"><Shield size={18} /><span><UiText text={"Your ID and portrait are private. There is no automatic photo-based identity approval. An authorized Kuula officer reviews your submission."} /></span></div>
          <PhotoField kind="front" label="Front of National ID" hint="Show all four corners and readable text." file={pictures.front} onPick={selectPhoto} busy={preparing.front} disabled={submitting} />
          <PhotoField kind="back" label="Back of National ID" hint="Keep the reverse side fully visible, without glare." file={pictures.back} onPick={selectPhoto} busy={preparing.back} disabled={submitting} />
          <PhotoField kind="portrait" label="Your portrait photograph" hint="Look straight at the camera, without sunglasses, in good lighting." file={pictures.portrait} onPick={selectPhoto} busy={preparing.portrait} disabled={submitting} />
          <label className="kx-terms" style={{ display: "flex", gap: 12, padding: 8 }}>
            <input type="checkbox" checked={photoConsent} onChange={event => setPhotoConsent(event.target.checked)} />
            <span><UiText text={"I consent to Kuula collecting and securely storing my National ID photographs and portrait for manual identity review. I understand that these images are sensitive personal data."} /></span>
          </label>
        </div>}
        {step === 3 && <div className="kx-alert kx-alert--success"><CheckCircle size={20} /><span><UiText text={status === "verified" ? "Verified. You can continue with Kuula." : "Under review. You can return to your dashboard and track verification status."} /></span></div>}
        <div className="kx-auth-stack" style={{ marginTop: 22 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} /><span><UiText text={error} /></span></div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={submitting || checking || preparingPhotos}>
            <UiText text={submitting ? "Uploading securely…" : checking ? "Checking status…" : preparingPhotos ? "Preparing photos…" : step === 1 ? "Continue to photos" : step === 2 ? "Submit ID and portrait" : "Go to dashboard"} /> <ArrowRight size={18} />
          </button>
        </div>
        <div className="kx-auth-foot"><Shield size={16} /><span><UiText text={"Kuula keeps identity records private and uses them only for lawful identity checks and credit assessment."} /></span></div>
      </form>
    </AuthLayout>
  );
}
