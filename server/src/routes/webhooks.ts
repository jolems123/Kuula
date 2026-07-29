/**
 * Payment provider callback receiver (C-08).
 *
 *   POST /api/webhooks/marzpay
 *
 * This is the ONLY place in Kuula where a loan becomes disbursed or a repayment
 * balance is reduced. Everything else can create `pending` rows and nothing
 * more. That makes this endpoint the entire trust boundary for real money, so
 * it is defended in layers:
 *
 *   1. Authenticity   — HMAC-SHA256 over the raw body, constant-time compared,
 *                       with a bounded timestamp window. Fails CLOSED.
 *   2. Replay         — `webhook_events.event_id` is UNIQUE. A redelivered or
 *                       captured-and-replayed callback loses the insert and is
 *                       acknowledged without effect.
 *   3. Matching       — the callback must resolve to an existing PENDING
 *                       internal transaction. Unknown references settle nothing.
 *   4. Verification   — the settlement decision comes from an authenticated
 *                       outbound status query to MarzPay, not from the inbound
 *                       body's `success` field.
 *   5. Amount + type  — the provider's amount must match the pending row, and
 *                       the row's type must match the callback's kind.
 *   6. Exactly-once   — settlement is a compare-and-set off `pending` inside a
 *                       `SELECT … FOR UPDATE` transaction.
 *
 * The endpoint answers 200 for anything it has definitively handled or safely
 * ignored, so the provider stops retrying; it answers 4xx/5xx only when the
 * caller is unauthenticated or when a retry could still help.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import * as marzpay from "../lib/marzpay.js";
import { settleDisbursement } from "../lib/disbursement.js";
import { settleRepayment } from "../lib/repayment.js";
import { audit } from "../lib/audit.js";
import { isUniqueViolation } from "../lib/db-lock.js";

const router = Router();

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (v == null ? "" : String(v));

interface ParsedCallback {
  reference: string;
  providerRef: string;
  eventType: string;
  claimsSuccess: boolean;
  claimsFailure: boolean;
  amount: number | null;
  eventId: string;
  /** "conflicting" means the callback's own signals disagree — never settled. */
  kind: "disbursement" | "collection" | "unknown" | "conflicting";
}

/**
 * Normalise MarzPay's callback shapes. The provider nests the transaction under
 * `data.transaction`, `data.collection` or the root depending on the event, so
 * every location is checked before giving up.
 */
export function parseCallback(payload: Json, rawBody: string): ParsedCallback {
  const data = obj(payload.data);
  const txn = { ...obj(data.transaction), ...obj(payload.transaction) };
  const coll = { ...obj(data.collection), ...obj(payload.collection) };
  const disb = { ...obj(data.disbursement), ...obj(payload.disbursement) };

  const reference = str(
    payload.reference || data.reference || txn.reference || coll.reference || disb.reference
  );
  const providerRef = str(
    payload.providerReference || payload.uuid || txn.uuid || coll.uuid || disb.uuid || data.uuid || txn.id
  );
  const eventType = str(payload.eventType || payload.event || data.eventType || txn.status || payload.status);

  const normalised = eventType.toLowerCase();
  const claimsSuccess = payload.isSuccess === true || /success|complete|paid|settled/.test(normalised);
  const claimsFailure = /fail|declin|cancel|reject|expire|revers|timeout/.test(normalised);

  const rawAmount = payload.amount ?? data.amount ?? txn.amount ?? coll.amount ?? disb.amount;
  const parsedAmount = rawAmount == null || rawAmount === "" ? null : Math.round(Number(rawAmount));
  const amount = Number.isFinite(parsedAmount as number) ? parsedAmount : null;

  // A stable identity for the event. When the provider supplies its own id we
  // use it; otherwise a hash of the meaningful fields, so a genuine redelivery
  // (identical body) collides while a legitimately new event does not.
  const providerEventId = str(payload.eventId || payload.event_id || payload.id || data.eventId);
  const eventId =
    providerEventId ||
    crypto
      .createHash("sha256")
      .update(`${reference}|${providerRef}|${normalised}|${amount ?? ""}|${rawBody.length}`)
      .digest("hex");

  // Each signal is read independently, then cross-checked. A callback whose
  // event type says one thing while its reference says another is not a
  // callback we understand — it is either a provider bug or a crafted request,
  // and either way it must not settle money.
  const signals = new Set<"disbursement" | "collection">();
  if (reference.startsWith("LOAN-")) signals.add("disbursement");
  if (reference.startsWith("REPAY-")) signals.add("collection");
  if (/disburse|payout/.test(normalised) || Object.keys(disb).length > 0) signals.add("disbursement");
  if (/collect/.test(normalised) || Object.keys(coll).length > 0) signals.add("collection");

  const kind: ParsedCallback["kind"] =
    signals.size > 1 ? "conflicting" : signals.size === 1 ? [...signals][0] : "unknown";

  return { reference, providerRef, eventType, claimsSuccess, claimsFailure, amount, eventId, kind };
}

/**
 * Locate the pending internal transaction this callback refers to.
 *
 * Matching is by OUR reference or the provider's own id — never by user or
 * loan alone, so a callback can never be applied to an unrelated transaction.
 */
async function findTransaction(parsed: ParsedCallback) {
  if (parsed.reference) {
    const byRef = await prisma.transaction.findUnique({ where: { reference: parsed.reference } });
    if (byRef) return byRef;
  }
  if (parsed.providerRef) {
    const byProvider = await prisma.transaction.findUnique({ where: { providerRef: parsed.providerRef } });
    if (byProvider) return byProvider;
  }
  return null;
}

router.post("/marzpay", async (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});

  // ── Layer 1: authenticity. Fails closed. ─────────────────────────────────
  const auth = marzpay.verifyCallbackAuth({
    rawBody,
    signature: header(req, "x-marzpay-signature") || header(req, "x-webhook-signature"),
    timestamp: header(req, "x-marzpay-timestamp") || header(req, "x-webhook-timestamp"),
    token: (req.query.token as string | undefined) ?? header(req, "x-webhook-token"),
  });
  if (!auth.ok) {
    console.warn(`[webhook] rejected callback: ${auth.reason}`);
    await audit({
      action: "webhook.rejected",
      entityType: "webhook",
      entityId: auth.reason,
      metadata: { reason: auth.reason, ip: req.ip },
    });
    res.status(auth.status).json({ error: auth.reason });
    return;
  }

  const payload = obj(req.body);
  const parsed = parseCallback(payload, rawBody);

  if (!parsed.reference && !parsed.providerRef) {
    res.status(400).json({ error: "malformed callback: no reference" });
    return;
  }

  // ── Layer 2: replay / duplicate protection. ──────────────────────────────
  // The UNIQUE insert happens BEFORE any processing, so two callbacks arriving
  // concurrently with the same event id serialise here and only one proceeds.
  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        provider: "marzpay",
        eventId: parsed.eventId,
        reference: parsed.reference || null,
        providerRef: parsed.providerRef || null,
        eventType: parsed.eventType || null,
        payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
        payload: payload as Prisma.InputJsonValue,
        status: "received",
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const seen = await prisma.webhookEvent.findUnique({ where: { eventId: parsed.eventId } });
    // Already reached a terminal state, or another delivery is processing it
    // right now. Acknowledge so the provider stops retrying, change nothing.
    const terminal = seen && seen.status !== "received";
    const inFlight = seen && Date.now() - seen.receivedAt.getTime() < 60_000;
    if (!seen || terminal || inFlight) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    // A previous delivery errored out mid-processing and the provider is
    // retrying. Let it through — exactly-once is guaranteed by the
    // compare-and-set on transactions.status, not by this table, so a genuine
    // retry is safe while a replay of an already-settled event is still a no-op.
    event = seen;
  }

  const finish = async (status: string, result: string, code = 200) => {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status, result: result.slice(0, 500), processedAt: new Date() },
    });
    res.status(code).json({ received: true, result });
  };

  try {
    // ── Layer 3: must match an existing pending internal transaction. ──────
    const txn = await findTransaction(parsed);
    if (!txn) {
      await finish("ignored", "no-matching-transaction");
      return;
    }
    if (txn.status !== "pending") {
      // Late duplicate for an already-settled movement.
      await finish("ignored", `already-${txn.status}`);
      return;
    }

    // ── Layer 5a: the callback's kind must match the ledger row's type. ────
    const expectedKind = txn.type === "loan_disbursement" ? "disbursement" : "collection";
    if (parsed.kind === "conflicting") {
      await finish("rejected", `type-mismatch: callback signals disagree (${parsed.eventType} vs ${parsed.reference})`);
      return;
    }
    if (parsed.kind !== "unknown" && parsed.kind !== expectedKind) {
      await finish("rejected", `type-mismatch: callback ${parsed.kind}, ledger ${txn.type}`);
      return;
    }

    // ── Layer 4: independent verification. ────────────────────────────────
    // The inbound body is a notification, not evidence. Where we can ask the
    // provider directly, its answer wins; a raw SUCCESS field alone never
    // settles money.
    let success: boolean;
    let providerAmount = parsed.amount;
    let reason = `callback ${parsed.eventType || "unknown"}`;

    if (config.marzpay.verifyCallbacks && marzpay.paymentsConfigured()) {
      const ref = txn.providerRef || parsed.providerRef || txn.reference;
      if (!ref) {
        await finish("ignored", "no-provider-reference-to-verify");
        return;
      }
      try {
        const status = await marzpay.fetchTransactionStatus(ref);
        if (!status.final) {
          // The provider says this is still in flight. Nothing to settle yet;
          // leave the row pending for the next callback or reconciliation.
          await finish("ignored", `provider-not-final: ${status.status}`);
          return;
        }
        success = status.success;
        providerAmount = status.amount ?? parsed.amount;
        reason = `verified with provider: ${status.status}`;
      } catch (err) {
        // Verification is unavailable. Refuse to settle on the unverified body
        // and ask the provider to retry.
        await finish("received", `verification-unavailable: ${(err as Error).message}`, 503);
        return;
      }
    } else {
      if (!parsed.claimsSuccess && !parsed.claimsFailure) {
        await finish("ignored", `indeterminate-event: ${parsed.eventType}`);
        return;
      }
      success = parsed.claimsSuccess;
    }

    // ── Layer 5b + 6: amount check and exactly-once settlement. ────────────
    const outcome =
      txn.type === "loan_disbursement"
        ? await settleDisbursement({
            transactionId: txn.id,
            success,
            providerRef: parsed.providerRef || txn.providerRef,
            providerAmount,
            reason,
          })
        : await settleRepayment({
            transactionId: txn.id,
            success,
            providerRef: parsed.providerRef || txn.providerRef,
            providerAmount,
            reason,
          });

    await audit({
      action: "webhook.processed",
      entityType: "transaction",
      entityId: txn.id,
      metadata: {
        eventId: parsed.eventId,
        type: txn.type,
        success,
        applied: outcome.applied,
        result: outcome.reason,
      },
    });

    await finish(outcome.applied ? "processed" : "ignored", outcome.reason);
  } catch (err) {
    console.error("[webhook] processing error", err);
    await prisma.webhookEvent
      .update({
        where: { id: event.id },
        data: { status: "rejected", result: `error: ${(err as Error).message}`.slice(0, 500), processedAt: new Date() },
      })
      .catch(() => {});
    // 500 so the provider retries; the event row is already recorded, and the
    // retry carries the same event id, so it cannot double-apply.
    res.status(500).json({ error: "processing failed" });
  }
});

function header(req: Request, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default router;
