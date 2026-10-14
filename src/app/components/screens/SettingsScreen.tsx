import {
  ArrowLeft, User, Bell, Shield, LifeBuoy, Info, ChevronRight, Globe,
} from "lucide-react";
import { useState } from "react";
import { CustomerProfilePhoto } from "./CustomerProfilePhoto";
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
  const user = state.user;

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
        className="mx-4 mt-4 p-4 rounded-2xl flex flex-wrap items-center gap-4"
        style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
      >
        <CustomerProfilePhoto token={state.session.token} initials={user?.initials ?? "?"} />
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
