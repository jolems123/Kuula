// Credit scoring service (Edge Function).
//
//   GET /functions/v1/credit-score            -> score for the caller
//   GET /functions/v1/credit-score?userId=..  -> admin: score for any user
//
// Runs with the SERVICE ROLE key (Edge Function secret) so it can read the
// scoring inputs, but it authenticates the caller's JWT first and only lets
// admins score other users.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeCreditScore } from "../_shared/core.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Identify the caller from their JWT.
  const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401, cors);

  const admin = createClient(url, serviceKey);
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const requested = new URL(req.url).searchParams.get("userId");
  const targetId = requested && me?.role === "admin" ? requested : user.id;

  const { data: p } = await admin.from("profiles")
    .select("momo_months, momo_txn_count, crb_status, kyc_verified, loans_total, loans_repaid")
    .eq("id", targetId).single();
  const { data: sav } = await admin.from("savings_accounts").select("balance").eq("user_id", targetId).single();

  if (!p) return json({ error: "Profile not found" }, 404, cors);

  return json(computeCreditScore({
    momoMonths: p.momo_months, momoTxnCount: p.momo_txn_count, crbStatus: p.crb_status,
    kycVerified: p.kyc_verified, loansRepaid: p.loans_repaid, loansTotal: p.loans_total,
    savingsBalance: sav?.balance ?? 0,
  }), 200, cors);
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
