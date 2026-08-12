import { Home, ShieldCheck, Store, Menu, Sparkles } from "lucide-react";

interface BottomNavProps {
  active: "home" | "credit" | "network" | "settings" | "loans" | "wallet" | "goals";
  onNavigate: (screen: string) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const tabs = [
    { id: "home", icon: Home, label: "Home", screen: "home" },
    { id: "credit", icon: ShieldCheck, label: "Credit Pass", screen: "credit-pass" },
    { id: "action", icon: Sparkles, label: "", screen: "use-credit" },
    { id: "network", icon: Store, label: "Network", screen: "partner-network" },
    { id: "settings", icon: Menu, label: "More", screen: "settings" },
  ];

  const legacyActive = active === "loans" ? "credit" : active === "goals" || active === "wallet" ? "network" : active;

  return (
    <nav className="kuula-bottom-nav absolute bottom-0 left-0 right-0" aria-label="Main navigation">
      <div className="flex items-end justify-around" style={{ minHeight: 72, padding: "8px 8px 20px" }}>
        {tabs.map(({ id, icon: Icon, label, screen }) => {
          const isAction = id === "action";
          const isActive = legacyActive === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={isAction ? "Use Kuula credit" : label}
              aria-current={isActive && !isAction ? "page" : undefined}
              onClick={() => onNavigate(screen)}
              className="flex flex-col items-center justify-center"
              style={{
                width: isAction ? 60 : 68,
                height: isAction ? 60 : 50,
                marginTop: isAction ? -24 : 0,
                border: isAction ? "6px solid white" : "none",
                borderRadius: isAction ? 999 : 12,
                background: isAction ? "linear-gradient(145deg,#F2C94C,#DDAE29)" : "transparent",
                color: isAction ? "#173323" : isActive ? "#0B5E3A" : "#7B8781",
                boxShadow: isAction ? "0 10px 26px rgba(104,80,14,.24)" : "none",
                cursor: "pointer",
                gap: 3,
              }}
            >
              <Icon size={isAction ? 26 : 21} strokeWidth={isActive || isAction ? 2.35 : 1.9} />
              {!isAction && <span style={{ fontSize: 9, fontWeight: isActive ? 800 : 600, lineHeight: 1 }}>{label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
