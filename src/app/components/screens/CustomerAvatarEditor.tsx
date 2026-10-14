import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { api } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image cannot be opened on your device."));
    img.src = src;
  });
}

export function CustomerAvatarEditor() {
  const { state, updateProfile } = useAppContext();
  const token = state.session.token;
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const currentSource = useRef<string | null>(null);
  const savedObject = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    api.fetchCustomerAvatar(token).then(blob => {
      if (!blob || !live) return;
      const url = URL.createObjectURL(blob);
      if (savedObject.current) URL.revokeObjectURL(savedObject.current);
      savedObject.current = url;
      setSavedUrl(url);
    }).catch(() => { if (live) setError("Your saved profile photo could not be loaded."); });
    return () => {
      live = false;
      if (currentSource.current) URL.revokeObjectURL(currentSource.current);
      if (savedObject.current) URL.revokeObjectURL(savedObject.current);
    };
  }, [token]);

  useEffect(() => {
    if (!sourceUrl) return;
    let live = true;
    loadImage(sourceUrl).then(image => {
      if (!live) return;
      const surface = canvas.current;
      const ctx = surface?.getContext("2d");
      if (!surface || !ctx) return;
      const size = surface.width;
      ctx.clearRect(0, 0, size, size);
      const base = Math.max(size / image.width, size / image.height);
      const scaled = base * zoom;
      const width = image.width * scaled;
      const height = image.height * scaled;
      const dx = (size - width) / 2 + (offsetX / 100) * Math.max(0, width - size) / 2;
      const dy = (size - height) / 2 + (offsetY / 100) * Math.max(0, height - size) / 2;
      ctx.drawImage(image, Math.max(size - width, Math.min(0, dx)), Math.max(size - height, Math.min(0, dy)), width, height);
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Unable to preview image."); });
    return () => { live = false; };
  }, [sourceUrl, zoom, offsetX, offsetY]);

  const selectImage = (file?: File) => {
    if (!file) return;
    setNotice(""); setError("");
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setError("Select a photo smaller than 15 MB."); return;
    }
    const url = URL.createObjectURL(file);
    if (currentSource.current) URL.revokeObjectURL(currentSource.current);
    currentSource.current = url;
    setZoom(1); setOffsetX(0); setOffsetY(0); setSourceUrl(url);
  };

  const save = async () => {
    if (!token || !canvas.current || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.current!.toBlob(resolve, "image/jpeg", 0.84));
      if (!blob || blob.size > 1_000_000) throw new Error("Unable to prepare a valid photo under 1 MB.");
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read the cropped photo."));
        reader.onerror = () => reject(new Error("Unable to read the cropped photo."));
        reader.readAsDataURL(blob);
      });
      await api.uploadCustomerAvatar(token, image);
      const url = URL.createObjectURL(blob);
      if (savedObject.current) URL.revokeObjectURL(savedObject.current);
      savedObject.current = url;
      setSavedUrl(url);
      updateProfile({ avatarUrl: url });
      if (currentSource.current) URL.revokeObjectURL(currentSource.current);
      currentSource.current = null;
      setSourceUrl(null);
      setNotice("Your profile photo has been saved securely.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profile photo upload failed.");
    } finally { setBusy(false); }
  };

  return <div style={{ marginTop: 12, borderTop: "1px solid #E2EAE5", paddingTop: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#0B5E3A", color: "white", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
        {savedUrl ? <img src={savedUrl} alt="Your customer profile photo" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ fontSize: 18, fontWeight: 700 }}>{state.user?.initials ?? "?"}</span>}
      </div>
      <div><strong style={{ color: "#173D2B", fontSize: 13 }}>Profile picture</strong>
        <p style={{ fontSize: 11, color: "#64756B", margin: "4px 0" }}>Take a selfie or choose a gallery photo, then crop it.</p>
      </div>
    </div>
    <input ref={cameraInput} type="file" accept="image/*" capture="user" aria-label="Take profile picture" style={{ display: "none" }} onChange={e => { selectImage(e.target.files?.[0]); e.target.value = ""; }}/>
    <input ref={galleryInput} type="file" accept="image/*" aria-label="Choose profile picture from gallery" style={{ display: "none" }} onChange={e => { selectImage(e.target.files?.[0]); e.target.value = ""; }}/>
    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={() => cameraInput.current?.click()} style={{ border: "1px solid #C5D7CB", padding: "9px 12px", borderRadius: 9, display: "flex", alignItems: "center", gap: 5 }}><Camera size={15}/> Take photo</button>
      <button type="button" onClick={() => galleryInput.current?.click()} style={{ border: "1px solid #C5D7CB", padding: "9px 12px", borderRadius: 9, display: "flex", alignItems: "center", gap: 5 }}><ImagePlus size={15}/> Gallery</button>
    </div>
    {sourceUrl && <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 12 }}>Preview and crop</strong>
      <canvas ref={canvas} width={320} height={320} aria-label="Square crop preview" style={{ display: "block", width: 220, maxWidth: "100%", height: "auto", aspectRatio: "1", marginTop: 8, borderRadius: "50%", border: "2px solid #0B5E3A" }}/>
      {([["Zoom", zoom, setZoom, 1, 3, 0.05], ["Move left or right", offsetX, setOffsetX, -100, 100, 1], ["Move up or down", offsetY, setOffsetY, -100, 100, 1]] as const).map(([label, val, setter, min, max, step]) => <label key={label} style={{ display: "block", fontSize: 12, marginTop: 9 }}>{label}<input type="range" aria-label={label} min={min} max={max} step={step} value={val} onChange={e => setter(Number(e.target.value))} style={{ display: "block", width: 240, maxWidth: "100%" }}/></label>)}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={busy} onClick={() => void save()} style={{ background: "#0B5E3A", color: "white", borderRadius: 9, padding: "10px 16px" }}>{busy ? "Uploading…" : "Save photo"}</button>
        <button type="button" disabled={busy} onClick={() => { if (currentSource.current) URL.revokeObjectURL(currentSource.current); currentSource.current = null; setSourceUrl(null); }} style={{ padding: "10px 16px", border: "1px solid #CFDCD3", borderRadius: 9 }}>Cancel</button>
      </div>
    </div>}
    {error && <p role="alert" style={{ color: "#B42318", fontSize: 12, marginTop: 8 }}>{error}</p>}
    {notice && <p role="status" style={{ color: "#0B5E3A", fontSize: 12, marginTop: 8 }}>{notice}</p>}
    <p style={{ fontSize: 10, color: "#819188", marginTop: 9 }}>Your profile photo is private and is not a substitute for identity verification.</p>
  </div>;
}
