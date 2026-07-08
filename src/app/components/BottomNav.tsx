import { useTranslation } from "react-i18next";
import { Home, DollarSign, Wallet, Target, Settings } from "lucide-react";

interface BottomNavProps {
  active: "home" | "loans" | "wallet" | "goals" | "settings";
  onNavigate: (screen: string) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const { t } = useTranslation();

  const tabs = [
    { id: "home", icon: Home, label: t("nav.home") },
    { id: "loans", icon: DollarSign, label: t("nav.loans") },
    { id: "wallet", icon: Wallet, label: t("nav.wallet") },
    { id: "goals", icon: Target, label: t("nav.goals") },
    { id: "settings", icon: Settings, label: t("nav.settings") },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-white border-t"
      style={{ borderColor: "rgba(0,0,0,0.08)", paddingBottom: 28 }}
    >
      <div className="flex items-center justify-around pt-2">
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (id === "home") onNavigate("home");
                else if (id === "goals") onNavigate("goals");
                else if (id === "settings") onNavigate("settings");
                else if (id === "loans") onNavigate("loan-history");
                else onNavigate(id);
              }}
              className="flex flex-col items-center gap-0.5 px-3 py-1"
            >
              <Icon
                size={22}
                color={isActive ? "#FF6B35" : "#9CA3AF"}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? "#FF6B35" : "#9CA3AF",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
