/**
 * Legacy Supabase compatibility shim.
 *
 * Production Kuula uses the Node/Express API backed by PostgreSQL. This module
 * deliberately has no Supabase package import, so old imports cannot pull the
 * Supabase runtime into the frontend bundle. It may be deleted after a verified
 * dependency/lockfile cleanup confirms no remaining callers.
 */
export const isSupabaseConfigured = false;
export const supabase = null;

export function requireSupabase(): never {
  throw new Error("Supabase runtime is disabled. Use the Kuula Node API backend.");
}
