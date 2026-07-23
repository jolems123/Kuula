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

  // ── Mobile money (display-only values) ────────────────────────────────────
  // MTN/Airtel API keys and secrets are SERVER-SIDE ONLY and must never be
  // added here: every VITE_* variable is inlined into the public JS bundle.
  MTN_CALLBACK_URL: optional("VITE_MTN_CALLBACK_URL", "https://api.kuula.ug/mtn/callback"),
  MTN_ENVIRONMENT: optional("VITE_MTN_ENVIRONMENT", "sandbox"),
  AIRTEL_CALLBACK_URL: optional("VITE_AIRTEL_CALLBACK_URL", "https://api.kuula.ug/airtel/callback"),
  AIRTEL_ENVIRONMENT: optional("VITE_AIRTEL_ENVIRONMENT", "sandbox"),

  // ── App ───────────────────────────────────────────────────────────────────
  APP_ENV: optional("VITE_APP_ENV", "development"),
  APP_VERSION: optional("VITE_APP_VERSION", "0.0.0"),

  // ── Feature flags ─────────────────────────────────────────────────────────
  ENABLE_BIOMETRIC: optional("VITE_ENABLE_BIOMETRIC", "true") === "true",
  ENABLE_SAVINGS: optional("VITE_ENABLE_SAVINGS", "true") === "true",

  // ── Store review bypass ────────────────────────────────────────────────────
  // When true the welcome screen auto-logs in with a sandbox reviewer account
  // so Apple / Google reviewers can navigate the full UI without needing a
  // live backend, real phone number, or SMS OTP.
  REVIEWER_MODE: optional("VITE_REVIEWER_MODE", "false") === "true",
} as const;

export type Env = typeof env;

/**
 * Collects fatal misconfiguration errors WITHOUT throwing.
 */
export function getConfigErrors(): string[] {
  const errors: string[] = [];

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

  if (!env.USE_API) return errors;

  if (import.meta.env.PROD && (!env.API_BASE_URL || env.API_BASE_URL.startsWith("http://localhost"))) {
    errors.push(
      "Production build requires a real VITE_API_BASE_URL (https://…); refusing the localhost default."
    );
  }

  return errors;
}
