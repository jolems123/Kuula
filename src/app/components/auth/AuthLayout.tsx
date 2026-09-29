import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { KuulaLogo } from "../brand/KuulaLogo";
import { SlideIndicator } from "./PhotoBackdrop";

interface AuthLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Text under the logo, e.g. "Staff portal". Omit for customer screens. */
  logoSubtitle?: string | null;
  /** Shown on the top right, e.g. the language picker. */
  topRight?: ReactNode;
}

/** Brand story shown beside the form on wide screens and above it on the landing page. */
export function AuthStory({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`kx-story${compact ? " kx-story--compact" : ""}`}>
      <p className="kx-story__eyebrow">Kuula Microfinance</p>
      <h1 className="kx-story__title">Access. Grow. <span>Prosper.</span></h1>
      <p className="kx-story__lede">Everyday credit for the traders and shop owners who keep Uganda moving.</p>
      <SlideIndicator />
    </div>
  );
}

/**
 * Layout for every sign-in style screen. The photos themselves come from the
 * PhotoBackdrop the app shell mounts behind these routes; this adds the top bar,
 * the brand story and a frosted-glass card for the form.
 */
export function AuthLayout({ children, onBack, backLabel = "Go back", logoSubtitle = null, topRight }: AuthLayoutProps) {
  return (
    <div className="kx kx-scene">
      <div className="kx-scene__top">
        {onBack && (
          <button type="button" className="kx-scene__back" onClick={onBack} aria-label={backLabel}>
            <ArrowLeft size={18} />
          </button>
        )}
        <KuulaLogo tone="light" size={34} subtitle={logoSubtitle} />
        {topRight && <div className="kx-scene__top-right">{topRight}</div>}
      </div>
      <div className="kx-scene__story"><AuthStory /></div>
      <div className="kx-scene__panel">
        <div className="kx-glass kx-scene__card">{children}</div>
        <p className="kx-scene__legal">© {new Date().getFullYear()} Kuula Microfinance Limited</p>
      </div>
    </div>
  );
}
