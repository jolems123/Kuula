// Loan repayment collection (Edge Function) — REAL money.
//
//   POST /functions/v1/marzpay-collect   body: { amount? }
//
// Authenticated customer initiates a repayment. We send a MarzPay collection
// (request-to-pay) to their phone; the customer approves the prompt and the
// final outcome arrives at marzpay-webhook, which settles the ledger. This
// function only records a PENDING attempt — it never marks the loan paid.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { marzConfigured, marzCollect, webhookUrl } from "../_shared/marzpay.ts";
import { corsHeaders } from "../_shared/cors.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RETIRED — see supabase/functions/RETIRED.md and KUULA_PAYMENT_ARCHITECTURE.md
//
// The Node backend in server/ is the single authoritative backend for money
// movement. This function is kept only as a reference and must never handle
// production traffic: two backends writing the same loans cannot guarantee
// exactly-once financial effects.
// ─────────────────────────────────────────────────────────────────────────────
const RETIRED_RESPONSE = new Response(
  JSON.stringify({
    error: "This endpoint is retired. Kuula payments are served by the Node backend at /api.",
  }),
  { status: 410, headers: { "Content-Type": "application/json" } },
);
const FUNCTION_ENABLED = Deno.env.get("SUPABASE_FUNCTIONS_ENABLED") === "true";

Deno.serve(async (req) => {
  if (!FUNCTION_ENABLED) return RETIRED_RESPONSE.clone();

  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401, cors);

  if (!marzConfigured()) {
    return json({ error: "MarzPay is not configured — set MARZPAY_API_KEY and MARZPAY_API_SECRET." }, 503, cors);
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { amount } = await req.json().catch(() => ({})) as { amount?: number };

  // The caller's active (unpaid) repayment, soonest due first.
  const { data: rep } = await admin
    .from("repayments").select("*")
    .eq("user_id", user.id).neq("status", "paid")
    .order("due_date", { ascending: true }).order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!rep) return json({ status: "none", reason: "no-active-loan" }, 200, cors);

  const outstanding = rep.total - rep.amount_paid;
  const pay = amount != null ? Math.min(Math.max(Math.round(amount), 0), outstanding) : outstanding;
  if (pay <= 0) return json({ status: "none", reason: "nothing-due" }, 200, cors);

  const { data: prof } = await admin.from("profiles").select("phone").eq("id", user.id).single();
  const phone = prof?.phone ?? "";
  if (!phone) return json({ error: "No phone number on file" }, 422, cors);

  const reference = `REPAY-${rep.id}`;
  const result = await marzCollect({
    phone,
    amount: pay,
    reference,
    description: `Kuula repayment ${rep.loan_id}`,
    callbackUrl: webhookUrl(url),
  });

  const attempt = {
    at: new Date().toISOString(),
    method: "momo-collection",
    amount: pay,
    success: false,
    reason: result.ok ? "pending-customer-approval" : `request-failed: ${result.message}`,
    provider_uuid: result.uuid,
    reference,
  };
  await admin.from("repayments").update({ attempts: [...(rep.attempts ?? []), attempt] }).eq("id", rep.id);

  if (!result.ok) {
    return json({ status: "failed", reason: result.message, provider: result.raw }, 502, cors);
  }

  await admin.from("transactions").insert({
    user_id: user.id,
    loan_id: rep.loan_id,
    type: "loan_payment",
    amount: pay,
    status: "pending", // flipped to completed/failed by the webhook
    transaction_id: result.uuid || reference,
  });

  return json({
    status: "pending",
    uuid: result.uuid,
    amount: pay,
    reference,
    message: "Approve the payment prompt on your phone to complete the repayment.",
  }, 200, cors);
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
