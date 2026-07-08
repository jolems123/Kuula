// Auto-payment scheduler (Edge Function).
//
// Intended to run on a schedule (see supabase/config.toml cron, or pg_cron).
// For every unpaid repayment that has reached its due date it attempts a
// mobile-money auto-debit from the customer's wallet; on success it marks the
// loan paid and writes a receipt. Failures advance the collection ladder
// (handled at read time by collectionStage()).
//
// Runs with the SERVICE ROLE key so it can move balances across all users.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { collectionStage } from "../_shared/core.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = Date.now();
  const { data: due, error } = await admin
    .from("repayments")
    .select("*")
    .eq("status", "scheduled")
    .lte("due_date", new Date(now).toISOString());

  if (error) return json({ error: error.message }, 500, cors);

  let collected = 0, failed = 0;
  for (const r of due ?? []) {
    const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", r.user_id).single();
    const outstanding = r.total - r.amount_paid;
    const balance = wallet?.balance ?? 0;
    const stage = collectionStage(new Date(r.due_date).getTime(), r.status, now);
    const attempt = {
      at: new Date(now).toISOString(),
      method: "momo-auto-debit",
      amount: outstanding,
      success: balance >= outstanding,
      reason: balance >= outstanding ? "collected" : "insufficient-wallet-balance",
      stage: stage.stage,
    };
    const attempts = [...(r.attempts ?? []), attempt];

    if (attempt.success) {
      await admin.from("wallets").update({ balance: balance - outstanding }).eq("user_id", r.user_id);
      await admin.from("repayments").update({
        status: "paid", amount_paid: r.total, attempts,
        receipt_id: `RCPT-${now}-${r.id.slice(0, 6)}`,
      }).eq("id", r.id);
      collected++;
    } else {
      await admin.from("repayments").update({ attempts }).eq("id", r.id);
      failed++;
    }
  }

  return json({ processed: (due ?? []).length, collected, failed, ranAt: new Date(now).toISOString() }, 200, cors);
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
