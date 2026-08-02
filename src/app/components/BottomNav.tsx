import { useTranslation } from "react-i18next";
import { Home, Landmark, PiggyBank, Menu, Plus } from "lucide-react";

interface BottomNavProps {
  active: "home" | "loans" | "wallet" | "goals" | "settings";
  onNavigate: (screen: string) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const { t } = useTranslation();

  const tabs = [
    { id: "home", icon: Home, label: t("nav.home"), screen: "home" },
    { id: "loans", icon: Landmark, label: t("nav.loans"), screen: "loan-history" },
    { id: "action", icon: Plus, label: "", screen: "quick-actions" },
    { id: "goals", icon: PiggyBank, label: t("nav.goals"), screen: "goals" },
    { id: "settings", icon: Menu, label: t("nav.settings"), screen: "settings" },
  ];

  return (
    <nav className="kuula-bottom-nav absolute bottom-0 left-0 right-0" aria-label="Main navigation">
      <div className="flex items-end justify-around" style={{ minHeight: 72, padding: "8px 8px 20px" }}>
        {tabs.map(({ id, icon: Icon, label, screen }) => {
          const isAction = id === "action";
          const isActive = active === id || (active === "wallet" && id === "action");
          return (
            <button
              key={id}
              type="button"
              aria-current={isActive && !isAction ? "page" : undefined}
              onClick={() => onNavigate(screen)}
              className="flex flex-col items-center justify-center"
              style={{
                width: isAction ? 58 : 64,
                height: isAction ? 58 : 50,
                marginTop: isAction ? -22 : 0,
                border: isAction ? "6px solid white" : "none",
                borderRadius: isAction ? 999 : 12,
                background: isAction ? "linear-gradient(145deg, #0F7045, #04351F)" : "transparent",
                color: isAction ? "white" : isActive ? "#0B5E3A" : "#7B8781",
                boxShadow: isAction ? "0 10px 26px rgba(4,53,31,.28)" : "none",
                cursor: "pointer",
                gap: 3,
              }}
            >
              <Icon size={isAction ? 28 : 21} strokeWidth={isActive || isAction ? 2.35 : 1.9} />
              {!isAction && (
                <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 500, lineHeight: 1 }}>
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
