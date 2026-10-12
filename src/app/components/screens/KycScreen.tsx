import { AlertCircle, ArrowRight, Camera, CheckCircle, Shield, User, RefreshCcw } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { isValidUgandaNin, normalizeNin } from "../../lib/nin";
import { AuthLayout } from "../auth/AuthLayout";

interface Props { onNavigate: (screen: string) => void; }
type ImageSide = "front" | "back" | "portrait";
type Pictures = Record<ImageSide, File | null>;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image"));
    reader.onerror = () => reject(new Error("Could not read this image"));
    reader.readAsDataURL(file);
  });
}

/** Browser or native webview camera capture. Photos remain in memory until submission. */
function PhotoField({ kind, label, hint, file, onPick }: {
  kind: ImageSide; label: string; hint: string; file: File | null; onPick: (side: ImageSide, file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    onPick(kind, e.target.files?.[0] ?? null);
    e.target.value = "";
  };
  return (
    <label className="kx-field" style={{ display: "block", border: "1px solid #D5E8DA", borderRadius: 14, padding: 13, background: "rgba(255,255,255,.08)" }}>
      <span className="kx-label" style={{ display: "flex", alignItems: "center", gap: 7 }}><Camera size={16} />{label}</span>
      <span className="kx-hint" style={{ display: "block", margin: "5px 0 9px" }}>{hint}</span>
      <input type="file" name={kind} accept="image/jpeg,image/png,image/webp" capture={kind === "portrait" ? "user" : "environment"}
        onChange={change} aria-label={label} style={{ maxWidth: "100%", fontSize: 13 }} />
      {preview && <img src={preview} alt={label + " preview"} style={{ width: "100%", maxHeight: 170, objectFit: "contain", marginTop: 10, borderRadius: 10 }} />}
      {file && <span className="kx-hint" style={{ display: "block", marginTop: 7 }}>Selected · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
    </label>
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
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    let live = true;
    api.getKycStatus(token).then(({ kyc }) => {
      if (!live) return;
      const current = String(kyc.status ?? "");
      setStatus(current);
      if (current === "pending" || current === "verified") setStep(3);
      if (current === "rejected") setRejectionReason(String(kyc.decisionReason ?? "Your document photographs need to be retaken."));
    }).catch(() => {
      if (live) setError("Could not check identity status. You can still enter your details.");
    }).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [token]);

  const selectPhoto = (side: ImageSide, file: File | null) => {
    setError("");
    if (file && (!ALLOWED_TYPES.has(file.type) || file.size < 32 || file.size > MAX_BYTES)) {
      setError("Use a JPG, PNG or WEBP image no larger than 5 MB.");
      setPictures(previous => ({ ...previous, [side]: null }));
      return;
    }
    setPictures(previous => ({ ...previous, [side]: file }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || checking) return;
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
    setSubmitting(true);
    try {
      const [frontImage, backImage, portraitImage] = await Promise.all([readImage(front), readImage(back), readImage(portrait)]);
      const result = await api.submitKycDocuments(token, {
        nationalId: normalizeNin(idNumber), fullName: fullName.trim(), dob, frontImage, backImage, portraitImage,
      });
      setStatus(result.kyc.status);
      setPictures({ front: null, back: null, portrait: null });
      setRejectionReason("");
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
      <div className="kx-steps" aria-label={`Step ${step} of 3`}>
        <div className="kx-steps__bars" aria-hidden="true">
          {[1, 2, 3].map(n => <span key={n} className={step >= n ? "is-done" : ""} />)}
        </div>
        Step {step} of 3
      </div>
      <form onSubmit={submit} noValidate aria-busy={submitting || checking}>
        <div className="kx-auth-head">
          <div className="kx-auth-head__icon" aria-hidden="true">
            {step === 1 ? <User size={22} /> : step === 2 ? <Camera size={22} /> : <CheckCircle size={22} />}
          </div>
          <h2>{step === 1 ? "Confirm your National ID" : step === 2 ? "Capture your ID and portrait" : status === "verified" ? "Identity verified" : "Documents submitted"}</h2>
          <p>{step === 1 ? "Enter the details printed on your Uganda National ID." : step === 2 ? "Photograph the front and back of the original card, then take a clear portrait of yourself." : status === "verified" ? "Your identity verification has been completed." : "Your photographs are securely submitted for review by an authorized Kuula officer."}</p>
        </div>
        {step === 1 && <>
          {rejectionReason && <div className="kx-alert kx-alert--error" role="status"><RefreshCcw size={16} /><span>Previous submission rejected: {rejectionReason}. Please resubmit clear photos.</span></div>}
          <div className="kx-field"><label htmlFor="kyc-nin" className="kx-label">National ID number (NIN)</label>
            <input id="kyc-nin" className="kx-input" value={idNumber} maxLength={14} autoComplete="off" onChange={e => setIdNumber(normalizeNin(e.target.value))} placeholder="14-character NIN" /></div>
          <div className="kx-field"><label htmlFor="kyc-name" className="kx-label">Full legal name</label>
            <input id="kyc-name" className="kx-input" value={fullName} maxLength={120} autoComplete="name" onChange={e => setFullName(e.target.value)} /></div>
          <div className="kx-field"><label htmlFor="kyc-dob" className="kx-label">Date of birth</label>
            <input id="kyc-dob" className="kx-input" type="date" value={dob} onChange={e => setDob(e.target.value)} autoComplete="bday" /></div>
        </>}
        {step === 2 && <div className="kx-auth-stack">
          <div className="kx-alert kx-alert--info"><Shield size={18} /><span>Your ID and portrait are private. There is no automatic photo-based identity approval. An authorized Kuula officer reviews your submission.</span></div>
          <PhotoField kind="front" label="Front of National ID" hint="Show all four corners and readable text." file={pictures.front} onPick={selectPhoto} />
          <PhotoField kind="back" label="Back of National ID" hint="Keep the reverse side fully visible, without glare." file={pictures.back} onPick={selectPhoto} />
          <PhotoField kind="portrait" label="Your portrait photograph" hint="Look straight at the camera, without sunglasses, in good lighting." file={pictures.portrait} onPick={selectPhoto} />
        </div>}
        {step === 3 && <div className="kx-alert kx-alert--success"><CheckCircle size={20} /><span>{status === "verified" ? "Verified. You can continue with Kuula." : "Under review. You can return to your dashboard and track verification status."}</span></div>}
        <div className="kx-auth-stack" style={{ marginTop: 22 }}>
          {error && <div className="kx-alert kx-alert--error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
          <button type="submit" className="kx-btn kx-btn--primary kx-btn--lg kx-btn--block" disabled={submitting || checking}>
            {submitting ? "Uploading securely…" : checking ? "Checking status…" : step === 1 ? "Continue to photos" : step === 2 ? "Submit ID and portrait" : "Go to dashboard"} <ArrowRight size={18} />
          </button>
        </div>
        <div className="kx-auth-foot"><Shield size={16} /><span>Kuula keeps identity records private and uses them only for lawful identity checks and credit assessment.</span></div>
      </form>
    </AuthLayout>
  );
}
