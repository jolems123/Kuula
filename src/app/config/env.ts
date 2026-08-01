/**
 * Centralised frontend environment configuration.
 *
 * Kuula has one production backend:
 * React/Capacitor -> Node/Express API -> PostgreSQL.
 */

function optional(key: string, fallback = ""): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

export const env = {
  BACKEND: optional("VITE_BACKEND", "node").trim().toLowerCase(),

  /** Base URL for the Kuula Node API, e.g. https://api.kuula.ug */
  API_BASE_URL: optional("VITE_API_BASE_URL", "http://localhost:3000").replace(/\/$/, ""),

  /** Request timeout in milliseconds. */
  API_TIMEOUT_MS: Number(optional("VITE_API_TIMEOUT_MS", "10000")),

  /** When true, authentication and data use the real Node API. */
  USE_API: optional("VITE_USE_API", "false") === "true",

  // Display-only mobile-money values. Provider credentials remain server-side.
  MTN_CALLBACK_URL: optional("VITE_MTN_CALLBACK_URL", "https://api.kuula.ug/mtn/callback"),
  MTN_ENVIRONMENT: optional("VITE_MTN_ENVIRONMENT", "sandbox"),
  AIRTEL_CALLBACK_URL: optional("VITE_AIRTEL_CALLBACK_URL", "https://api.kuula.ug/airtel/callback"),
  AIRTEL_ENVIRONMENT: optional("VITE_AIRTEL_ENVIRONMENT", "sandbox"),

  APP_ENV: optional("VITE_APP_ENV", "development"),
  APP_VERSION: optional("VITE_APP_VERSION", "0.0.0"),

  ENABLE_BIOMETRIC: optional("VITE_ENABLE_BIOMETRIC", "true") === "true",
  ENABLE_SAVINGS: optional("VITE_ENABLE_SAVINGS", "true") === "true",

  /** Sandbox-only store reviewer bypass. Must always be false in production. */
  REVIEWER_MODE: optional("VITE_REVIEWER_MODE", "false") === "true",
} as const;

export type Env = typeof env;

function validateProductionApiUrl(value: string): string[] {
  const errors: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return ["Production VITE_API_BASE_URL must be a valid absolute URL."];
  }

  if (parsed.protocol !== "https:") {
    errors.push("Production VITE_API_BASE_URL must use HTTPS.");
  }

  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
    errors.push("Production VITE_API_BASE_URL cannot point to a local machine.");
  }

  return errors;
}

/** Collect fatal configuration errors without throwing before React mounts. */
export function getConfigErrors(): string[] {
  const errors: string[] = [];
  const isProd = import.meta.env.PROD || env.APP_ENV === "production";

  if (env.BACKEND !== "node") {
    errors.push(
      `Unsupported backend "${env.BACKEND || "empty"}". Kuula requires the Node/Express API with PostgreSQL.`
    );
  }

  if (isProd && !env.USE_API) {
    errors.push(
      "Production build must set VITE_USE_API=true — demo accounts cannot ship to customers."
    );
  }

  if (isProd && env.REVIEWER_MODE) {
    errors.push(
      "VITE_REVIEWER_MODE must be false in production — reviewer auto-login cannot ship."
    );
  }

  if (env.USE_API && isProd) {
    errors.push(...validateProductionApiUrl(env.API_BASE_URL));
  }

  if (!Number.isFinite(env.API_TIMEOUT_MS) || env.API_TIMEOUT_MS < 1000) {
    errors.push("VITE_API_TIMEOUT_MS must be a number of at least 1000 milliseconds.");
  }

  return errors;
}
