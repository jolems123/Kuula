/**
 * Centralised env config.
 *
 * All VITE_* variables are validated here at startup. If a required
 * variable is missing the app throws immediately with a clear message
 * rather than failing silently deep inside a component.
 *
 * Usage:
 *   import { env } from "@/config/env";
 *   fetch(env.API_BASE_URL + "/loans");
 */

function required(key: string): string {
  const value = import.meta.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value as string;
}

function optional(key: string, fallback = ""): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

export const env = {
  // ── API ───────────────────────────────────────────────────────────────────
  /** Base URL for the Kuula backend, e.g. https://api.kuula.ug */
  API_BASE_URL: optional("VITE_API_BASE_URL", "http://localhost:3000"),

  /** Request timeout in ms */
  API_TIMEOUT_MS: Number(optional("VITE_API_TIMEOUT_MS", "10000")),

  /** When true, auth runs against the real backend instead of demo data */
  USE_API: optional("VITE_USE_API", "false") === "true",

  /** Which backend powers the app: "supabase" (production) or "node" (legacy stub) */
  BACKEND: (optional("VITE_BACKEND", "node") === "supabase" ? "supabase" : "node") as "node" | "supabase",

  // ── Supabase ───────────────────────────────────────────────────────────────
  // Only the PUBLISHABLE (browser-safe) values belong here. The sb_secret_*
  // service key must NEVER be a VITE_* var — it lives only in Edge Function
  // secrets server-side, where it can bypass Row-Level Security safely.
  SUPABASE_URL:      optional("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: optional("VITE_SUPABASE_ANON_KEY"),

  // ── Mobile money (display-only values) ────────────────────────────────────
  // MTN/Airtel API keys and secrets are SERVER-SIDE ONLY and must never be
  // added here: every VITE_* variable is inlined into the public JS bundle.
  MTN_CALLBACK_URL:     optional("VITE_MTN_CALLBACK_URL", "https://api.kuula.ug/mtn/callback"),
  MTN_ENVIRONMENT:      optional("VITE_MTN_ENVIRONMENT", "sandbox"),
  AIRTEL_CALLBACK_URL:  optional("VITE_AIRTEL_CALLBACK_URL", "https://api.kuula.ug/airtel/callback"),
  AIRTEL_ENVIRONMENT:   optional("VITE_AIRTEL_ENVIRONMENT", "sandbox"),

  // ── App ───────────────────────────────────────────────────────────────────
  APP_ENV:    optional("VITE_APP_ENV", "development"),
  APP_VERSION: optional("VITE_APP_VERSION", "0.0.0"),

  // ── Feature flags ─────────────────────────────────────────────────────────
  ENABLE_BIOMETRIC: optional("VITE_ENABLE_BIOMETRIC", "true") === "true",
  ENABLE_SAVINGS:   optional("VITE_ENABLE_SAVINGS",   "true") === "true",

  // ── Store review bypass ────────────────────────────────────────────────────
  // When true the welcome screen auto-logs in with a sandbox reviewer account
  // so Apple / Google reviewers can navigate the full UI without needing a
  // live backend, real phone number, or SMS OTP.
  REVIEWER_MODE: optional("VITE_REVIEWER_MODE", "false") === "true",
} as const;

export type Env = typeof env;

/**
 * Collects fatal misconfiguration errors WITHOUT throwing.
 *
 * Throwing at module-init time happens before React mounts, so the error
 * boundary can't catch it and the user gets a blank screen. Instead main.tsx
 * calls this and renders a branded "configuration error" screen when it returns
 * anything, so failures are visible and controlled rather than a white page.
 *
 * Only checks the backend actually in use (USE_API on), so demo/offline and
 * store-reviewer builds are never blocked.
 */
export function getConfigErrors(): string[] {
  const errors: string[] = [];

  // ── Production hard guards ──────────────────────────────────────────────
  // Demo accounts (any 4-digit PIN) and the store-reviewer auto-login bypass
  // must NEVER reach real users. These run BEFORE the demo early-return below
  // so a demo build can't short-circuit past them.
  const isProd = import.meta.env.PROD || env.APP_ENV === "production";
  if (isProd && !env.USE_API) {
    errors.push(
      "Production build must set VITE_USE_API=true — demo accounts (any 4-digit PIN) cannot ship to real users."
    );
  }
  if (isProd && env.REVIEWER_MODE) {
    errors.push(
      "VITE_REVIEWER_MODE must be false in production — the store-reviewer auto-login bypass cannot ship to real users."
    );
  }

  if (!env.USE_API) return errors; // demo/offline build — no live backend needed

  if (env.BACKEND === "supabase" && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)) {
    errors.push(
      "VITE_BACKEND=supabase but VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are missing."
    );
  }

  if (
    import.meta.env.PROD &&
    env.BACKEND === "node" &&
    (!env.API_BASE_URL || env.API_BASE_URL.startsWith("http://localhost"))
  ) {
    errors.push(
      "Production build requires a real VITE_API_BASE_URL (https://…); refusing the localhost default."
    );
  }

  return errors;
}
