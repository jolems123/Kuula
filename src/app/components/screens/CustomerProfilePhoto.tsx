import { UiText, uiText } from "../../../i18n/ui-text";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

interface Props {
  token: string | null;
  initials: string;
}
const maxFileBytes = 20 * 1024 * 1024;
export function CustomerProfilePhoto({ token, initials }: Props) {
  const [saved, setSaved] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api.getProfilePhoto(token).then(url => { if (active) setSaved(url); })
      .catch(() => { if (active) setError("Could not load your saved profile photo."); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => () => { if (source?.startsWith("blob:")) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { if (saved?.startsWith("blob:")) URL.revokeObjectURL(saved); }, [saved]);

  const selectPhoto = (file?: File) => {
    setError(""); setNotice("");
    if (!file) return;
    if (file.size > maxFileBytes || (!file.type.startsWith("image/") && file.type !== "")) {
      setError("Choose a camera or gallery photo up to 20MB.");
      return;
    }
    setSource(URL.createObjectURL(file));
    setZoom(1); setHorizontal(50); setVertical(50);
  };
  const crop = async () => {
    if (!token || !imageRef.current || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const image = imageRef.current;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Wait for your photo to load.");
      const size = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const left = (image.naturalWidth - size) * horizontal / 100;
      const top = (image.naturalHeight - size) * vertical / 100;
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo cropping is unavailable on this device.");
      context.drawImage(image, left, top, size, size, 0, 0, 512, 512);
      const photo = canvas.toDataURL("image/jpeg", 0.82);
      await api.saveProfilePhoto(token, photo);
      setSaved(photo);
      setSource(null);
      setNotice("Your profile photo was saved securely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload profile photo.");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || busy) return;
    setBusy(true); setError("");
    try { await api.deleteProfilePhoto(token); setSaved(null); setSource(null); setNotice("Profile photo removed."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove photo."); }
    finally { setBusy(false); }
  };
  const dimension = source ? "180px" : "64px";
  return <section aria-label={uiText("Customer profile photo")} style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#0B5E3A", border: "3px solid #DFF2E9",
        display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
        {saved ? <img src={saved} alt={uiText("Your profile")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 23, fontWeight: 800, color: "white" }}>{initials || "?"}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
        <label style={{ fontSize: 12, fontWeight: 700, padding: "8px 10px", background: "#EDF8F2", color: "#0B5E3A", borderRadius: 9, cursor: "pointer" }}><UiText text={" Take photo "} /><input aria-label={uiText("Take profile photo")} type="file" accept="image/*" capture="user" style={{ display: "none" }}
            onChange={e => { selectPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, padding: "8px 10px", background: "#EDF8F2", color: "#0B5E3A", borderRadius: 9, cursor: "pointer" }}><UiText text={" Gallery "} /><input aria-label={uiText("Choose profile photo from gallery")} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { selectPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {saved && <button type="button" onClick={() => void remove()} disabled={busy}
          style={{ fontSize: 12, border: 0, background: "transparent", color: "#A13A3A" }}><UiText text={"Remove"} /></button>}
      </div>
    </div>
    {source && <div style={{ borderTop: "1px solid #EDF1EE", paddingTop: 12 }}>
      <p style={{ color: "#374151", fontSize: 12, fontWeight: 700 }}><UiText text={"Preview and crop"} /></p>
      <div style={{ width: dimension, height: dimension, margin: "8px auto", borderRadius: "50%", overflow: "hidden",
        border: "3px solid #DFF2E9", background: "#E6EDEA" }}>
        <img ref={imageRef} src={source} alt={uiText("Photo crop preview")} style={{
          width: "100%", height: "100%", objectFit: "cover",
          objectPosition: horizontal + "% " + vertical + "%", transform: "scale(" + zoom + ")",
        }}/>
      </div>
      <label style={{ display: "block", fontSize: 12 }}><UiText text={"Zoom "} /><input aria-label={uiText("Crop zoom")} style={{ width: "100%" }} type="range" min={1} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
      </label>
      <label style={{ display: "block", fontSize: 12 }}><UiText text={"Move horizontally "} /><input aria-label={uiText("Crop horizontal position")} style={{ width: "100%" }} type="range" min={0} max={100} value={horizontal} onChange={e => setHorizontal(Number(e.target.value))} />
      </label>
      <label style={{ display: "block", fontSize: 12 }}><UiText text={"Move vertically "} /><input aria-label={uiText("Crop vertical position")} style={{ width: "100%" }} type="range" min={0} max={100} value={vertical} onChange={e => setVertical(Number(e.target.value))} />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={busy || !token} onClick={() => void crop()}
          style={{ borderRadius: 9, background: "#0B5E3A", color: "white", border: 0, padding: "10px 13px", fontSize: 12 }}>
          <UiText text={busy ? "Uploading…" : "Crop and save"} />
        </button>
        <button type="button" disabled={busy} onClick={() => setSource(null)}
          style={{ borderRadius: 9, background: "#F2F4F3", border: 0, padding: "10px 13px", fontSize: 12 }}><UiText text={"Cancel"} /></button>
      </div>
    </div>}
    {notice && <p role="status" style={{ color: "#0B5E3A", fontSize: 12 }}>{notice}</p>}
    {error && <p role="alert" style={{ color: "#B42318", fontSize: 12 }}><UiText text={error} /></p>}
  </section>;
}
