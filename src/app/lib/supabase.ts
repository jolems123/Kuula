/**
 * Supabase client — created lazily from the browser-safe publishable values.
 *
 * Safe to ship: the URL and publishable (anon) key are public by design;
 * Row-Level Security in the database is what actually protects data. The
 * sb_secret_* service key is NEVER used here — it lives only in Edge Function
 * secrets. If the env vars are absent the client is null and callers fall back
 * to the Node reference backend, so the app still builds and runs offline.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const isSupabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Narrowing helper so call sites get a non-null client or a clear error. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  return supabase;
}
