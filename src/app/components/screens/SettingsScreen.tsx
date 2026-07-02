import {
  ArrowLeft, User, Wallet, Bell, Shield, LifeBuoy, Info, ChevronRight, LogOut, Globe,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "../BottomNav";
import { useAppContext } from "../../context/AppContext";

interface Props {
  onNavigate: (screen: string) => void;
}

const menuItems = [
  { icon: User, label: "Personal Information", subtitle: "Name, ID, date of birth", color: "#0D5C3A", screen: "personal-info" },
  { icon: Wallet, label: "Payment Methods", subtitle: "MTN MoMo, Airtel Money", color: "#10B981", screen: "payment-methods-list" },
  { icon: Bell, label: "Notification Settings", subtitle: "SMS, email, push alerts", color: "#F59E0B", screen: "notification-settings" },
  { icon: Shield, label: "Privacy & Security", subtitle: "PIN, biometric, 2FA", color: "#8B5CF6", screen: "privacy-security" },
  { icon: LifeBuoy, label: "Help & Support", subtitle: "Chat, call, FAQ", color: "#06B6D4", screen: "help-support" },
  { icon: Info, label: "About App", subtitle: "Version 2.4.1 · UMRA licensed", color: "#6B7280", screen: "about-app" },
];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? "#0D5C3A" : "#E5E7EB",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: 10, background: "white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

export function SettingsScreen({ onNavigate }: Props) {
  const { t, i18n } = useTranslation();
  const { state, logout } = useAppContext();
  const user = state.user;
  const credit = state.credit;
  const loan = state.loan;

  const [toggles, setToggles] = useState({ sms: true, push: true, email: false });

  const menuItemI18n: Record<string, { label: string; subtitle: string }> = {
    "personal-info": { label: t("settings.personalInfo"), subtitle: t("settings.personalInfoSub") },
    "payment-methods-list": { label: t("settings.paymentMethods"), subtitle: "MTN MoMo, Airtel Money" },
    "notification-settings": { label: t("settings.notifSettings"), subtitle: t("settings.notifSettingsSub") },
    "privacy-security": { label: t("settings.privacySecurity"), subtitle: t("settings.privacySecuritySub") },
    "help-support": { label: t("settings.helpSupport"), subtitle: t("settings.helpSupportSub") },
    "about-app": { label: t("settings.aboutApp"), subtitle: "Version 2.4.1 · UMRA licensed" },
  };
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const flip = (k: keyof typeof toggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  const handleLogout = () => { logout(); onNavigate("welcome"); };

  return (
    <div className="flex flex-col h-full bg-gray-50" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div
        className="flex items-center px-4 pt-4 pb-4"
        style={{ background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}
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
            background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid #B6DCC8",
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 800, color: "white" }}>{user?.initials ?? "?"}</span>
        </div>
        <div className="flex-1">
          <p style={{ fontSize: 17, fontWeight: 700, color: "#1F2937" }}>{user?.fullName ?? "—"}</p>
          <p style={{ fontSize: 13, color: "#6B7280" }}>{user?.phone ?? "—"}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#10B981" }} />
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 500 }}>{t("settings.verifiedAccount")}</span>
          </div>
        </div>
        <button
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

      {/* Credit score quick view */}
      <div className="mx-4 mt-3 flex gap-3">
        {[
          { label: t("settings.creditScore"), value: String(credit?.score ?? "—"), sub: credit?.tier ?? "—", color: "#10B981" },
          { label: t("settings.memberSince"), value: "2024", sub: user?.memberSince?.split(" ")[1] ?? "", color: "#0D5C3A" },
          { label: t("settings.loansTaken"), value: String(loan?.totalLoansCount ?? 0), sub: t("settings.allRepaid"), color: "#8B5CF6" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex-1 p-3 rounded-xl text-center"
            style={{ background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}
          >
            <p style={{ fontSize: 16, fontWeight: 800, color: stat.color }}>{stat.value}</p>
            <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 1 }}>{stat.label}</p>
            <p style={{ fontSize: 9, color: stat.color, fontWeight: 600 }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Language picker */}
      <div className="mx-4 mt-3 p-3 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <button
          onClick={() => onNavigate("language")}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#ECF5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={17} color="#0D5C3A" />
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

      {/* Quick toggles */}
      <div className="mx-4 mt-3 p-4 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("settings.quickPrefs")}</p>
        {[
          { key: "sms" as const, label: t("settings.smsAlerts"), sub: t("settings.smsAlertsSub") },
          { key: "push" as const, label: t("settings.pushNotifs"), sub: t("settings.pushNotifsSub") },
          { key: "email" as const, label: t("settings.emailDigest"), sub: t("settings.emailDigestSub") },
        ].map(({ key, label, sub }, i, arr) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #F9FAFB" : "none" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0" }}>{sub}</p>
            </div>
            <Toggle on={toggles[key]} onChange={() => flip(key)} />
          </div>
        ))}
      </div>

      {/* Menu items */}
      <div
        className="mx-4 mt-3 rounded-2xl overflow-hidden"
        style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: 80 }}
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
                background: isHovered ? "#ECF5F0" : "white",
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
              <ChevronRight size={16} color={isHovered ? "#0D5C3A" : "#D1D5DB"} style={{ transition: "color 0.15s", transform: isHovered ? "translateX(2px)" : "none" }} />
            </button>
          );
        })}
      </div>

      {/* Log out */}
      <div className="mx-4 mb-4" style={{ position: "absolute", bottom: 76, left: 0, right: 0, paddingLeft: 16, paddingRight: 16 }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%", height: 50, borderRadius: 14,
            background: "#FEF2F2", color: "#EF4444",
            fontSize: 15, fontWeight: 700, border: "1px solid #FECACA", cursor: "pointer",
          }}
        >
          <LogOut size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
          {t("settings.logOut")}
        </button>
      </div>

      <BottomNav active="settings" onNavigate={onNavigate} />
    </div>
  );
}
