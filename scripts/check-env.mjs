#!/usr/bin/env node
/**
 * Build-time environment validation.
 *
 * Runs automatically before `npm run build` so a misconfigured store binary
 * fails before an APK, AAB, IPA, or web bundle is produced.
 *
 * Production architecture is intentionally single-backend:
 * React/Capacitor -> Node/Express API -> PostgreSQL.
 */
const env = process.env;
const useApi = env.VITE_USE_API === "true";
const backend = (env.VITE_BACKEND || "node").trim().toLowerCase();
const apiBase = (env.VITE_API_BASE_URL || "").trim();
const isProd = env.VITE_APP_ENV === "production" || env.NODE_ENV === "production";
const errors = [];

if (backend !== "node") {
  errors.push(
    `Unsupported VITE_BACKEND=${backend || "(empty)"}. Kuula uses the Node/Express API with PostgreSQL.`
  );
}

if (isProd && !useApi) {
  errors.push(
    "Production build must set VITE_USE_API=true — demo accounts must never ship to customers."
  );
}

if (isProd && env.VITE_REVIEWER_MODE === "true") {
  errors.push(
    "VITE_REVIEWER_MODE must be false in production — reviewer auto-login must not ship."
  );
}

if (useApi && isProd) {
  if (!apiBase) {
    errors.push("Production build requires VITE_API_BASE_URL.");
  } else {
    let parsed;
    try {
      parsed = new URL(apiBase);
    } catch {
      errors.push("VITE_API_BASE_URL must be a valid absolute URL.");
    }

    if (parsed) {
      if (parsed.protocol !== "https:") {
        errors.push("Production VITE_API_BASE_URL must use HTTPS.");
      }
      if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
        errors.push("Production VITE_API_BASE_URL cannot point to a local machine.");
      }
    }
  }
}

// Browser variables are public. Reject values that look like server secrets.
for (const key of Object.keys(env)) {
  if (!key.startsWith("VITE_")) continue;
  const value = env[key] || "";
  if (/service_role|private[_-]?key|jwt[_-]?secret|database_url|password=/i.test(value)) {
    errors.push(`${key} appears to contain a server secret. Never expose secrets as VITE_* variables.`);
  }
}

if (errors.length > 0) {
  console.error("\n✖ Environment validation failed:\n");
  for (const error of errors) console.error("  • " + error);
  console.error("\nFix the variables above before building for production.\n");
  process.exit(1);
}

console.log(`✓ Environment validation passed (${useApi ? "Node/PostgreSQL backend" : "demo build"}).`);
