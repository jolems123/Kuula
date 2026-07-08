// MarzPay async callback receiver (Edge Function).
//
//   POST /functions/v1/marzpay-webhook[?token=...]
//
// MarzPay POSTs here when a collection or disbursement reaches a final state.
// This is the ONLY place repayments are marked paid and disbursement/payment
// transactions are settled. verify_jwt is OFF (MarzPay has no Supabase JWT); we
// instead verify a shared token when MARZPAY_WEBHOOK_SECRET is configured.
//
// Matching: our `reference` is REPAY-<repaymentId> or LOAN-<applicationId>.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? v as Json : {});
const str = (v: unknown): string => (v == null ? "" : String(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Fail CLOSED: this endpoint is the only place money is settled, so it must
  // never accept unauthenticated callbacks. If the shared secret is not
  // configured we reject every request rather than trusting the caller.
  const expected = Deno.env.get("MARZPAY_WEBHOOK_SECRET") ?? "";
  if (!expected) {
    console.error("marzpay-webhook: MARZPAY_WEBHOOK_SECRET is not set — rejecting callback");
    return json({ error: "webhook not configured" }, 503);
  }
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (token !== expected) return json({ error: "invalid token" }, 401);

  const payload = obj(await req.json().catch(() => ({})));
  const data = obj(payload.data);
  const txn = { ...obj(data.transaction), ...obj(payload.transaction) };
  const coll = { ...obj(data.collection), ...obj(payload.collection) };

  const reference = str(payload.reference || data.reference || txn.reference || coll.reference);
  const providerRef = str(payload.providerReference || txn.uuid || coll.uuid || data.uuid || payload.uuid);
  const eventType = str(payload.eventType || data.eventType || txn.status || payload.status);
  const isSuccess = payload.isSuccess === true || /success|complete|paid/i.test(eventType);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (reference.startsWith("REPAY-")) {
      await settleRepayment(admin, reference.slice("REPAY-".length), providerRef, isSuccess);
    } else if (reference.startsWith("LOAN-")) {
      await settleDisbursement(admin, providerRef, reference, isSuccess);
    } else if (providerRef) {
      // Fallback: settle a transaction directly by provider reference.
      await admin.from("transactions")
        .update({ status: isSuccess ? "completed" : "failed" })
        .eq("transaction_id", providerRef).eq("status", "pending");
    }
  } catch (err) {
    console.error("marzpay-webhook error", err);
  }

  // Always 200 so MarzPay does not endlessly retry a delivered event.
  return json({ received: true }, 200);
});

async function findPendingTxn(admin: ReturnType<typeof createClient>, loanId: string, type: string, providerRef: string) {
  if (providerRef) {
    const { data } = await admin.from("transactions").select("*")
      .eq("transaction_id", providerRef).eq("status", "pending").limit(1).maybeSingle();
    if (data) return data;
  }
  const { data } = await admin.from("transactions").select("*")
    .eq("loan_id", loanId).eq("type", type).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function settleRepayment(admin: ReturnType<typeof createClient>, repId: string, providerRef: string, isSuccess: boolean) {
  const { data: rep } = await admin.from("repayments").select("*").eq("id", repId).maybeSingle();
  if (!rep) return;

  // Idempotency: only a still-pending attempt may be settled. A duplicate or
  // late callback (whose txn is already completed/failed) finds nothing here and
  // is a no-op — this prevents double-crediting / accidental loan forgiveness.
  const txn = await findPendingTxn(admin, rep.loan_id, "loan_payment", providerRef);
  if (!txn) return;

  const pay = (txn.amount as number | undefined) ?? 0;
  const attempts = Array.isArray(rep.attempts) ? rep.attempts : [];

  if (isSuccess) {
    // Claim the txn first (compare-and-set off 'pending'); if another delivery
    // already settled it, stop before touching the repayment balance.
    const { data: claimed } = await admin.from("transactions")
      .update({ status: "completed" }).eq("id", txn.id).eq("status", "pending").select().maybeSingle();
    if (!claimed) return;

    const newPaid = Math.min(rep.amount_paid + pay, rep.total);
    const settled = newPaid >= rep.total;
    const receipt = `RCPT-${Date.now()}`;
    await admin.from("repayments").update({
      amount_paid: newPaid,
      status: settled ? "paid" : rep.status,
      receipt_id: receipt,
      attempts: [...attempts, { at: new Date().toISOString(), method: "momo-collection", amount: pay, success: true, reason: "collected", provider_uuid: providerRef }],
    }).eq("id", rep.id);
    if (settled) {
      await admin.from("loan_applications").update({ status: "paid" }).eq("loan_id", rep.loan_id);
    }
  } else {
    const { data: claimed } = await admin.from("transactions")
      .update({ status: "failed" }).eq("id", txn.id).eq("status", "pending").select().maybeSingle();
    if (!claimed) return;
    await admin.from("repayments").update({
      attempts: [...attempts, { at: new Date().toISOString(), method: "momo-collection", amount: pay, success: false, reason: "declined-or-failed", provider_uuid: providerRef }],
    }).eq("id", rep.id);
  }
}

async function settleDisbursement(admin: ReturnType<typeof createClient>, providerRef: string, reference: string, isSuccess: boolean) {
  const appId = reference.slice("LOAN-".length);
  const { data: app } = await admin.from("loan_applications").select("loan_id").eq("id", appId).maybeSingle();
  const loanId = app?.loan_id ?? "";
  const txn = await findPendingTxn(admin, loanId, "loan_disbursement", providerRef);
  if (txn) {
    await admin.from("transactions").update({ status: isSuccess ? "completed" : "failed" }).eq("id", txn.id);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
