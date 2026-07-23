/**
 * Supabase runtime is disabled.
 * Keep this module as a compatibility shim while the frontend is Node-API only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const isSupabaseConfigured = false;
export const supabase: SupabaseClient | null = null;

export function requireSupabase(): SupabaseClient {
  throw new Error("Supabase runtime is disabled. Use the Node API backend.");
}
