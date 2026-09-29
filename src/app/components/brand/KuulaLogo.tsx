import { useId } from "react";

interface KuulaMarkProps {
  size?: number;
  /** "solid" sits on light surfaces; "glass" sits on green or photo backgrounds. */
  variant?: "solid" | "glass";
}

/** The Kuula K growth mark, drawn inline so it stays crisp at every size. */
export function KuulaMark({ size = 32, variant = "solid" }: KuulaMarkProps) {
  const gold = `kuula-gold-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD766" />
          <stop offset="1" stopColor="#F2C94C" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="225" fill={variant === "solid" ? "#0B5E3A" : "rgba(255,255,255,.12)"} />
      <path fill="#fff" d="M278 250h138v204l188-204h179L553 493l244 281H615L461 591l-45 46v137H278V250z" />
      <path fill={`url(#${gold})`} d="M710 272c94 73 154 187 154 315 0 111-45 212-118 285l-95-106c46-49 74-115 74-187 0-82-36-156-94-206l79-101z" />
    </svg>
  );
}

interface KuulaLogoProps {
  size?: number;
  /** "light" = white text for dark surfaces, "dark" = ink text for light surfaces. */
  tone?: "light" | "dark";
  subtitle?: string | null;
}

/** The one horizontal Kuula lockup used across the staff portal. */
export function KuulaLogo({ size = 32, tone = "dark", subtitle = "Staff portal" }: KuulaLogoProps) {
  return (
    <span className={`kx-logo kx-logo--${tone}`} aria-label="Kuula">
      <KuulaMark size={size} variant={tone === "light" ? "glass" : "solid"} />
      <span className="kx-logo__text">
        <b style={{ fontSize: Math.round(size * 0.53) }}>Kuula</b>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </span>
  );
}
