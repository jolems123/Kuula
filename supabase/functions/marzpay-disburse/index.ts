// Loan acceptance + disbursement (Edge Function) — REAL money.
//
//   POST /functions/v1/marzpay-disburse   body: { applicationId }
//
// Called when the BORROWER accepts their loan offer (status 'offered'). It sends
// the loan principal to the borrower's own mobile money via MarzPay, then (only
// after MarzPay accepts the payout) approves the application so the
// on_loan_decision trigger books the loan and schedules repayment. The final
// settlement outcome arrives later at marzpay-webhook.
//
// Runs with the SERVICE ROLE key but authenticates the caller's JWT first and
// only allows the loan's own borrower to accept it.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { marzConfigured, marzDisburse, webhookUrl } from "../_shared/marzpay.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!marzConfigured()) {
    return json({ error: "MarzPay is not configured — set MARZPAY_API_KEY and MARZPAY_API_SECRET." }, 503);
  }

  const { applicationId } = await req.json().catch(() => ({})) as { applicationId?: string };
  if (!applicationId) return json({ error: "applicationId is required" }, 400);

  const { data: app, error: appErr } = await admin
    .from("loan_applications").select("*").eq("id", applicationId).single();
  if (appErr || !app) return json({ error: "Application not found" }, 404);

  // Only the borrower may accept their own loan offer.
  if (app.applicant_id !== user.id) return json({ error: "You can only accept your own loan" }, 403);
  if (app.status !== "offered") return json({ error: `Loan is ${app.status}, not awaiting acceptance` }, 409);

  // Idempotency lock: claim the offer BEFORE any external payout via a
  // compare-and-set on accepted_at (NULL -> now) while status stays 'offered'.
  // This does NOT fire the booking trigger (which only runs on a status change),
  // so a concurrent second acceptance loses the race here and never reaches
  // MarzPay — eliminating the double-disbursement risk.
  const { data: claim } = await admin
    .from("loan_applications")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", app.id).eq("status", "offered").is("accepted_at", null)
    .select().maybeSingle();
  if (!claim) return json({ error: "Loan is already being processed" }, 409);

  const releaseLock = () =>
    admin.from("loan_applications").update({ accepted_at: null }).eq("id", app.id).eq("status", "offered");

  const { data: prof } = await admin.from("profiles").select("phone, full_name").eq("id", app.applicant_id).single();
  const phone = prof?.phone ?? "";
  if (!phone) { await releaseLock(); return json({ error: "Borrower has no phone number on file" }, 422); }

  const reference = `LOAN-${app.id}`;
  const result = await marzDisburse({
    phone,
    amount: app.amount,
    reference,
    description: `Kuula loan ${app.loan_id ?? app.id}`,
    callbackUrl: webhookUrl(url),
  });
  if (!result.ok) {
    await releaseLock();
    return json({ error: `Disbursement rejected by MarzPay: ${result.message}`, provider: result.raw }, 502);
  }

  // Money is on its way. Book the loan by flipping offered -> approved (the
  // on_loan_decision trigger schedules repayment). A payout has already left
  // MarzPay, so we RETRY the flip rather than abandon an unbooked loan on a
  // transient DB error.
  let updated: Record<string, unknown> | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 4 && !updated; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    const { data, error } = await admin
      .from("loan_applications")
      .update({ status: "approved" })
      .eq("id", app.id).eq("status", "offered").select().maybeSingle();
    if (data) { updated = data; break; }
    lastErr = error?.message ?? "status was not 'offered'";
  }

  // Always record the outgoing payout so the webhook can settle it and so it is
  // on the books. transaction_id ties it to the MarzPay reference for idempotent
  // settlement even if loan_id is not yet available.
  await admin.from("transactions").insert({
    user_id: app.applicant_id,
    loan_id: (updated?.loan_id as string | null) ?? app.loan_id ?? null,
    type: "loan_disbursement",
    amount: app.amount,
    status: "pending", // flipped to completed/failed by the webhook
    transaction_id: result.uuid || reference,
  });

  if (!updated) {
    // Payout was accepted by MarzPay but the loan could not be booked. We do NOT
    // release the accepted_at lock (so this can never be paid a second time) and
    // the disbursement transaction above is on record for manual reconciliation.
    return json({
      error: `Payout accepted but loan booking failed — flagged for reconciliation: ${lastErr}`,
      needsReconciliation: true,
      disbursement: { uuid: result.uuid, status: result.status, reference },
    }, 500);
  }

  return json({
    application: updated,
    disbursement: { uuid: result.uuid, status: result.status, reference },
  }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
