import {
  ArrowLeft, User, Bell, Shield, LifeBuoy, Info, ChevronRight, Globe,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";

interface Props {
  onNavigate: (screen: string) => void;
}

const menuItems = [
  { icon: User, label: "Personal Information", subtitle: "Name, ID, date of birth", color: "#0B5E3A", screen: "personal-info" },
  { icon: Bell, label: "Notification Settings", subtitle: "SMS and push alerts", color: "#F59E0B", screen: "notification-settings" },
  { icon: Shield, label: "Privacy & Security", subtitle: "PIN, biometric, 2FA", color: "#8B5CF6", screen: "privacy-security" },
  { icon: LifeBuoy, label: "Help & Support", subtitle: "Chat, call, FAQ", color: "#06B6D4", screen: "help-support" },
  { icon: Info, label: "About App", subtitle: "Version 2.4.1", color: "#6B7280", screen: "about-app" },
];

export function SettingsScreen({ onNavigate }: Props) {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoPreview, setPhotoPreview] = useState(false);
  const user = state.user;

  useEffect(() => {
    if (!token || !user?.id) return;
    let active = true;
    void api.customerPhoto(token).then(url => {
      if (!active) { if (url) URL.revokeObjectURL(url); return; }
      setProfilePhoto(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
    }).catch(() => { if (active) setPhotoError("Your saved profile photo is unavailable right now."); });
    return () => { active = false; };
  }, [token, user?.id]);

  useEffect(() => {
    if (!sourceImage || !photoPreview) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = cropCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = 320; canvas.height = 320;
      const shortest = Math.min(img.naturalWidth, img.naturalHeight);
      const cropSize = shortest / cropZoom;
      const maxX = Math.max(0, img.naturalWidth - cropSize);
      const maxY = Math.max(0, img.naturalHeight - cropSize);
      const left = maxX * ((cropX + 100) / 200);
      const top = maxY * ((cropY + 100) / 200);
      ctx.clearRect(0, 0, 320, 320);
      ctx.drawImage(img, left, top, cropSize, cropSize, 0, 0, 320, 320);
    };
    img.src = sourceImage;
    return () => { cancelled = true; };
  }, [sourceImage, photoPreview, cropZoom, cropX, cropY]);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    setPhotoError("");
    if (file.size > 20 * 1024 * 1024 || !file.type.startsWith("image/")) {
      setPhotoError("Choose an image smaller than 20MB."); return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError("Unable to read that image.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setSourceImage(reader.result);
      setCropX(0); setCropY(0); setCropZoom(1);
      setPhotoPreview(true);
    };
    reader.readAsDataURL(file);
  };

  const saveProfilePhoto = async () => {
    if (!token || !cropCanvasRef.current || photoBusy) return;
    setPhotoBusy(true); setPhotoError("");
    try {
      const photo = cropCanvasRef.current.toDataURL("image/jpeg", 0.82);
      await api.updateCustomerPhoto(token, photo);
      const saved = await api.customerPhoto(token);
      setProfilePhoto(prev => { if (prev) URL.revokeObjectURL(prev); return saved; });
      setPhotoPreview(false); setSourceImage(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Photo upload failed; retry.");
    } finally { setPhotoBusy(false); }
  };

  const removeProfilePhoto = async () => {
    if (!token || photoBusy) return;
    setPhotoBusy(true); setPhotoError("");
    try {
      await api.removeCustomerPhoto(token);
      setProfilePhoto(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    } catch (err) { setPhotoError(err instanceof Error ? err.message : "Could not remove your photo."); }
    finally { setPhotoBusy(false); }
  };

  const menuItemI18n: Record<string, { label: string; subtitle: string }> = {
    "personal-info": { label: t("settings.personalInfo"), subtitle: t("settings.personalInfoSub") },
    "notification-settings": { label: t("settings.notifSettings"), subtitle: t("settings.notifSettingsSub") },
    "privacy-security": { label: t("settings.privacySecurity"), subtitle: t("settings.privacySecuritySub") },
    "help-support": { label: t("settings.helpSupport"), subtitle: t("settings.helpSupportSub") },
    "about-app": { label: t("settings.aboutApp"), subtitle: "Version 2.4.1 · UMRA licensed" },
  };
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="kuula-settings-screen flex flex-col h-full bg-gray-50">
      <div className="kuula-settings-screen__scroll">
      {/* Header */}
      <div
        className="kuula-settings-screen__header flex items-center px-4 pt-4 pb-4"
        style={{ background: "linear-gradient(135deg, #0B5E3A, #064A2E)" }}
      >
        <button
          onClick={() => onNavigate("home")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.2)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>
          {t("settings.title")}
        </span>
      </div>

      {/* Profile section */}
      <div
        className="mx-4 mt-4 p-4 rounded-2xl flex items-center gap-4"
        style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: "linear-gradient(135deg, #0B5E3A, #064A2E)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid #DFF2E9",
          }}
        >
          {profilePhoto ? <img src={profilePhoto} alt="Your profile" style={{ width: 58, height: 58, borderRadius: "50%", objectFit: "cover" }} /> : <span style={{ fontSize: 24, fontWeight: 800, color: "white" }}>{user?.initials ?? "?"}</span>}
        </div>
        <div className="flex-1">
          <p style={{ fontSize: 17, fontWeight: 700, color: "#1F2937" }}>{user?.fullName ?? "—"}</p>
          <p style={{ fontSize: 13, color: "#6B7280" }}>{user?.phone ?? "—"}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <div style={{ width: 6, height: 6, borderRadius: 3, background: user?.verified ? "#178654" : "#9B6F15" }} />
            <span style={{ fontSize: 11, color: user?.verified ? "#178654" : "#9B6F15", fontWeight: 500 }}>{user?.verified ? t("settings.verifiedAccount") : "Verification pending"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("personal-info")}
          style={{
            padding: "7px 14px",
            borderRadius: 10,
            background: "#F3F4F6",
            border: "none",
            color: "#374151",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t("settings.edit")}
        </button>
      </div>

      <div className="mx-4 mt-3 p-4 rounded-2xl" style={{ background: "white" }}>
        <strong style={{ color: "#173A27", fontSize: 14 }}>Profile photo</strong>
        <p style={{ color: "#66766B", fontSize: 12, margin: "7px 0" }}>Take a photo or choose one from your gallery, adjust the square crop, then save it privately.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" disabled={photoBusy} onClick={() => cameraRef.current?.click()} style={{ padding: "9px 12px", borderRadius: 9, background: "#0B5E3A", border: 0, color: "white" }}>Take photo</button>
          <button type="button" disabled={photoBusy} onClick={() => galleryRef.current?.click()} style={{ padding: "9px 12px", borderRadius: 9, background: "#E5F2EA", border: 0, color: "#0B5E3A" }}>Choose from gallery</button>
          {profilePhoto && <button type="button" disabled={photoBusy} onClick={() => void removeProfilePhoto()} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #D8B7B7", background: "white", color: "#A12626" }}>Remove photo</button>}
        </div>
        <input aria-label="Capture profile photo" ref={cameraRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
          onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <input aria-label="Choose profile photo from gallery" ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
        {photoPreview && <div style={{ marginTop: 16 }}>
          <strong style={{ display: "block", fontSize: 12, marginBottom: 8 }}>Crop and preview</strong>
          <canvas aria-label="Square photo crop preview" ref={cropCanvasRef} width={320} height={320}
            style={{ width: "min(100%, 280px)", aspectRatio: "1", borderRadius: "50%", border: "2px solid #C7E1D2" }} />
          {([
            ["Zoom", cropZoom, 1, 3, 0.1, setCropZoom],
            ["Move left/right", cropX, -100, 100, 5, setCropX],
            ["Move up/down", cropY, -100, 100, 5, setCropY],
          ] as const).map(([name, value, min, max, step, setter]) =>
            <label key={name} style={{ display: "block", maxWidth: 320, marginTop: 10, fontSize: 12 }}>{name}
              <input aria-label={name} type="range" min={min} max={max} step={step} value={value} onChange={event => setter(Number(event.target.value))} style={{ display: "block", width: "100%" }} />
            </label>)}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" disabled={photoBusy} onClick={() => void saveProfilePhoto()} style={{ padding: "9px 14px", background: "#0B5E3A", color: "white", border: 0, borderRadius: 9 }}>{photoBusy ? "Saving…" : "Save profile photo"}</button>
            <button type="button" disabled={photoBusy} onClick={() => { setSourceImage(null); setPhotoPreview(false); }} style={{ padding: "9px 14px", background: "#E8EBE9", border: 0, borderRadius: 9 }}>Cancel</button>
          </div>
        </div>}
        {photoError && <p role="alert" style={{ color: "#A12626", fontSize: 12, marginTop: 10 }}>{photoError}</p>}
      </div>

      {/* Language picker */}
      <div className="mx-4 mt-3 p-3 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <button
          onClick={() => onNavigate("language")}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F3FAF7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={17} color="#0B5E3A" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>App Language</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0" }}>
                {i18n.language === "en" ? "English" : i18n.language === "lg" ? "Oluganda" : i18n.language === "sw" ? "Kiswahili" : i18n.language}
              </p>
            </div>
          </div>
          <ChevronRight size={16} color="#D1D5DB" />
        </button>
      </div>

      {/* Notification preferences are managed in one persisted settings screen.
          Do not show non-persistent local toggles that could mislead customers. */}
      <button type="button" onClick={() => onNavigate("notification-settings")} className="mx-4 mt-3 p-4 rounded-2xl"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "white", border: 0, textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <span><strong style={{ display: "block", color: "#1F2937", fontSize: 13 }}>Notification preferences</strong>
          <span style={{ fontSize: 11, color: "#6B7280" }}>Manage SMS and push notifications</span></span>
        <ChevronRight size={16} color="#6B7280" />
      </button>

      {/* Menu items */}
      <div
        className="mx-4 mt-3 rounded-2xl overflow-hidden"
        style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
      >
        {menuItems.map((item, i) => {
          const Icon = item.icon;
          const isHovered = hoveredItem === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.screen)}
              onMouseEnter={() => setHoveredItem(item.label)}
              onMouseLeave={() => setHoveredItem(null)}
              className="w-full flex items-center gap-3 px-4 py-3.5"
              style={{
                background: isHovered ? "#F3FAF7" : "white",
                border: "none",
                borderBottom: i < menuItems.length - 1 ? "1px solid #F3F4F6" : "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: item.color + "15",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transform: isHovered ? "scale(1.05)" : "none",
                  transition: "transform 0.15s",
                }}
              >
                <Icon size={18} color={item.color} />
              </div>
              <div className="flex-1">
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{menuItemI18n[item.screen]?.label ?? item.label}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF" }}>{menuItemI18n[item.screen]?.subtitle ?? item.subtitle}</p>
              </div>
              <ChevronRight size={16} color={isHovered ? "#0B5E3A" : "#D1D5DB"} style={{ transition: "color 0.15s", transform: isHovered ? "translateX(2px)" : "none" }} />
            </button>
          );
        })}
      </div>

      </div>
      <BottomNav active="settings" onNavigate={onNavigate} />
    </div>
  );
}
