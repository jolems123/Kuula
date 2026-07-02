#!/usr/bin/env node
/**
 * Build-time environment validation.
 *
 * Runs automatically before `npm run build` (npm "prebuild" hook) so a
 * misconfigured store binary fails the CI pipeline BEFORE artifacts are
 * produced — rather than shipping a broken APK/IPA that white-screens on
 * launch. Mirrors the runtime checks in src/app/config/env.ts.
 *
 * Skips validation for demo/offline builds (VITE_USE_API !== "true").
 */
const env = process.env;
const useApi = env.VITE_USE_API === "true";
const backend = env.VITE_BACKEND === "supabase" ? "supabase" : "node";
const apiBase = env.VITE_API_BASE_URL || "";

const errors = [];

// ── Production hard guards ──────────────────────────────────────────────────
// Run regardless of useApi so a demo/reviewer build can't ship to real users.
const isProd = env.VITE_APP_ENV === "production" || env.NODE_ENV === "production";
if (isProd && !useApi) {
  errors.push(
    "Production build must set VITE_USE_API=true — demo accounts (any 4-digit PIN) must not ship."
  );
}
if (isProd && env.VITE_REVIEWER_MODE === "true") {
  errors.push(
    "VITE_REVIEWER_MODE must be false in production — the store-reviewer auto-login bypass must not ship."
  );
}

if (useApi) {
  if (backend === "supabase" && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    errors.push(
      "VITE_BACKEND=supabase but VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are missing."
    );
  }
  if (backend === "node" && (!apiBase || apiBase.startsWith("http://localhost"))) {
    errors.push(
      "Production build requires a real VITE_API_BASE_URL (https://…); refusing the localhost default."
    );
  }
  // The service key must never be inlined into the public bundle.
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") && /sb_secret_|service_role/i.test(env[key] || "")) {
      errors.push(`${key} looks like a Supabase service/secret key — never expose it as a VITE_* var.`);
    }
  }
}

if (errors.length > 0) {
  console.error("\n✖ Environment validation failed:\n");
  for (const e of errors) console.error("  • " + e);
  console.error("\nFix the variables above before building for production.\n");
  process.exit(1);
}

console.log("✓ Environment validation passed (" + (useApi ? `${backend} backend` : "demo build") + ").");
