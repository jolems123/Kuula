import { House, ShieldCheck, HandCoins, Store, LayoutGrid } from "lucide-react";

interface BottomNavProps {
  active: "home" | "credit" | "network" | "settings" | "more" | "loans" | "wallet" | "borrow";
  onNavigate: (screen: string) => void;
}

const TABS = [
  { id: "home", icon: House, label: "Home", screen: "home" },
  { id: "credit", icon: ShieldCheck, label: "Credit Pass", screen: "credit-dashboard" },
  { id: "borrow", icon: HandCoins, label: "Borrow", screen: "quick-actions" },
  { id: "network", icon: Store, label: "Network", screen: "wallet" },
  { id: "settings", icon: LayoutGrid, label: "More", screen: "settings" },
] as const;

const ALIASES: Record<string, string> = { loans: "credit", wallet: "network", more: "settings" };

/** Customer tab bar: five equal tabs, one icon style, a single active marker. */
export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const current = ALIASES[active] ?? active;
  return (
    <nav className="kx kx-tabbar" aria-label="Main navigation">
      {TABS.map(({ id, icon: Icon, label, screen }) => {
        const isActive = current === id;
        return (
          <button
            key={id}
            type="button"
            className={`kx-tabbar__tab${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(screen)}
          >
            <Icon size={22} strokeWidth={isActive ? 2 : 1.6} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
