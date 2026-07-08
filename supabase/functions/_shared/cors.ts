// Shared CORS helper for Edge Functions.
//
// In production, only allow requests from the configured origin(s).
// In development, fall back to * for local testing convenience.
//
// Set CORS_ORIGIN env var in Supabase Edge Function secrets to restrict access.
// Example: CORS_ORIGIN=https://app.kuula.ug,https://kuula.ug

const ALLOWED_ORIGINS = (Deno.env.get("CORS_ORIGIN") ?? "").split(",").map(s => s.trim()).filter(Boolean);

/** Build CORS headers for a given request origin. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";

  // If no origins configured (dev), allow all.
  let allowOrigin = "*";
  if (ALLOWED_ORIGINS.length > 0) {
    // If the request origin matches a configured origin, echo it back.
    // Otherwise, send empty string which effectively blocks cross-origin.
    allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/** Return a 200 OPTIONS response (CORS preflight). */
export function corsOkResponse(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}