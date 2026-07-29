/**
 * MarzPay Uganda client — Node port of the retired Supabase Edge Function
 * client (`supabase/functions/_shared/marzpay.ts`).
 *
 * MarzPay (https://wallet.wearemarz.com) is a mobile-money aggregator that
 * routes to MTN MoMo and Airtel Money by phone number.
 *
 * The single most important property of this integration: money movement is
 * ASYNCHRONOUS. A 2xx from `disburse()`/`collect()` means only that MarzPay
 * ACCEPTED the request. The customer still has to approve the prompt on their
 * handset, and the real outcome arrives later on the webhook. Nothing in this
 * module may ever be treated as settlement.
 */
import crypto from "crypto";
import { config, paymentsConfigured } from "./config.js";

export { paymentsConfigured };

export class PaymentProviderError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly raw?: unknown) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Normalise any Ugandan number to the local 0XXXXXXXXX form MarzPay expects.
 * Returns "" when the input cannot be a Ugandan mobile number.
 */
export function toLocalPhone(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("256")) d = d.slice(3);
  if (d.length === 9) d = "0" + d; // 7XXXXXXXX -> 07XXXXXXXX
  return d;
}

/**
 * Ugandan mobile numbers are 10 local digits starting 07 (MTN 077/078/076/039,
 * Airtel 070/074/075/020). Anything else must not be sent a payout.
 */
export function isValidUgandaMobile(input: string): boolean {
  const local = toLocalPhone(input);
  return /^0(7[0-9]|20|39)\d{7}$/.test(local);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${config.marzpay.apiKey}:${config.marzpay.apiSecret}`).toString("base64");
}

export interface MarzResult {
  /** The request was ACCEPTED by MarzPay. NOT settlement. */
  ok: boolean;
  /** Provider status string, normally "pending" at acceptance. */
  status: string;
  /** Provider transaction reference — persisted so callbacks can be matched. */
  uuid: string;
  message: string;
  raw: unknown;
}

async function post(path: string, body: Record<string, unknown>): Promise<MarzResult> {
  if (!paymentsConfigured()) {
    throw new PaymentProviderError("MarzPay is not configured (MARZPAY_API_KEY / MARZPAY_API_SECRET).", false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.marzpay.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${config.marzpay.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Timeouts and connection failures are AMBIGUOUS: MarzPay may or may not
    // have received the request. The caller must leave the ledger row pending
    // and let the webhook or a reconciliation query decide — never assume
    // failure and never retry blindly onto a new payout.
    throw new PaymentProviderError(
      `MarzPay unreachable: ${(err as Error).message}`,
      true,
      null
    );
  } finally {
    clearTimeout(timer);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }

  const d = (data?.data ?? {}) as Record<string, unknown>;
  const txn = (d?.transaction ?? {}) as Record<string, unknown>;
  const uuid = String(txn?.uuid ?? d?.uuid ?? data?.uuid ?? "");
  const status = String(txn?.status ?? data?.status ?? (res.ok ? "pending" : "failed"));
  const ok = res.ok && data?.success !== false;
  const message = String(data?.message ?? (ok ? "accepted" : `MarzPay ${path} failed (${res.status})`));

  // 5xx is ambiguous the same way a timeout is.
  if (!ok && res.status >= 500) {
    throw new PaymentProviderError(message, true, data);
  }

  return { ok, status, uuid, message, raw: data };
}

export interface MarzMoneyArgs {
  phone: string;
  amount: number;
  /** Our reference, echoed back on the callback. */
  reference: string;
  description?: string;
  callbackUrl?: string;
}

/** Send money to a customer's mobile-money wallet (loan disbursement). */
export function disburse(p: MarzMoneyArgs): Promise<MarzResult> {
  return post("/disbursements", {
    phone_number: toLocalPhone(p.phone),
    amount: Math.round(p.amount),
    country: "UG",
    description: p.description ?? "Kuula loan disbursement",
    reference: p.reference,
    ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
  });
}

/** Request-to-pay against a customer's mobile-money wallet (loan repayment). */
export function collect(p: MarzMoneyArgs): Promise<MarzResult> {
  return post("/collections", {
    phone_number: toLocalPhone(p.phone),
    amount: Math.round(p.amount),
    country: "UG",
    description: p.description ?? "Kuula loan repayment",
    reference: p.reference,
    ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
  });
}

export interface ProviderStatus {
  /** Settled successfully. */
  success: boolean;
  /** Reached a terminal state (success or definitive failure). */
  final: boolean;
  status: string;
  /** Amount the provider says moved, in UGX. `null` when not reported. */
  amount: number | null;
  raw: unknown;
}

/**
 * Independently ask MarzPay what really happened to a transaction.
 *
 * This is the defence against a forged or optimistic callback: the webhook
 * calls this before applying any financial effect, so the settlement decision
 * comes from an authenticated outbound request to the provider rather than from
 * a `success: true` field in an inbound request body.
 */
export async function fetchTransactionStatus(providerRef: string): Promise<ProviderStatus> {
  if (!paymentsConfigured()) {
    throw new PaymentProviderError("MarzPay is not configured.", false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.marzpay.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${config.marzpay.baseUrl}/transactions/${encodeURIComponent(providerRef)}`, {
      headers: { Accept: "application/json", Authorization: authHeader() },
      signal: controller.signal,
    });
  } catch (err) {
    throw new PaymentProviderError(`MarzPay status check failed: ${(err as Error).message}`, true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new PaymentProviderError(`MarzPay status check returned ${res.status}`, res.status >= 500);
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const d = (data?.data ?? data) as Record<string, unknown>;
  const txn = (d?.transaction ?? d) as Record<string, unknown>;
  const status = String(txn?.status ?? "").toLowerCase();
  const rawAmount = txn?.amount;
  const amount = rawAmount == null || rawAmount === "" ? null : Math.round(Number(rawAmount));

  return {
    success: /^(success|successful|completed|complete|paid)$/.test(status),
    final: /^(success|successful|completed|complete|paid|failed|failure|cancelled|canceled|rejected|expired|reversed)$/.test(status),
    status: status || "unknown",
    amount: Number.isFinite(amount as number) ? amount : null,
    raw: data,
  };
}

/** Public URL MarzPay should POST async results to. */
export function callbackUrl(): string {
  if (!config.publicApiBaseUrl) return "";
  const base = `${config.publicApiBaseUrl}/api/webhooks/marzpay`;
  // The token mode carries the shared secret in the URL. HMAC mode does not —
  // the secret never leaves the server.
  if (config.marzpay.webhookMode === "token" && config.marzpay.webhookSecret) {
    return `${base}?token=${encodeURIComponent(config.marzpay.webhookSecret)}`;
  }
  return base;
}

/**
 * Verify callback authenticity.
 *
 * HMAC mode (preferred): HMAC-SHA256 over `<timestamp>.<raw body>` keyed with
 * the shared secret, compared in constant time, with a bounded timestamp window
 * so a captured callback cannot be replayed later.
 *
 * Token mode (legacy, matches the retired Supabase function): a shared bearer
 * secret in `?token=` or `X-Webhook-Token`.
 *
 * Both modes FAIL CLOSED — with no secret configured, nothing is ever accepted.
 */
export function verifyCallbackAuth(args: {
  rawBody: string;
  signature?: string;
  timestamp?: string;
  token?: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: string; status: number } {
  const secret = config.marzpay.webhookSecret;
  if (!secret) {
    return { ok: false, reason: "webhook-not-configured", status: 503 };
  }

  if (config.marzpay.webhookMode === "token") {
    const provided = args.token ?? "";
    if (!provided) return { ok: false, reason: "missing-token", status: 401 };
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid-token", status: 401 };
    }
    return { ok: true };
  }

  const signature = (args.signature ?? "").trim().replace(/^sha256=/i, "");
  const timestamp = (args.timestamp ?? "").trim();
  if (!signature) return { ok: false, reason: "missing-signature", status: 401 };
  if (!timestamp) return { ok: false, reason: "missing-timestamp", status: 401 };

  const tsMs = /^\d{13}$/.test(timestamp) ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return { ok: false, reason: "invalid-timestamp", status: 401 };

  const now = args.nowMs ?? Date.now();
  if (Math.abs(now - tsMs) > config.marzpay.webhookToleranceSec * 1000) {
    // Outside the tolerance window this is a replay of a previously captured
    // callback, even if the signature itself is genuine.
    return { ok: false, reason: "stale-timestamp", status: 401 };
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${args.rawBody}`).digest("hex");
  const provided = Buffer.from(signature.toLowerCase(), "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    return { ok: false, reason: "invalid-signature", status: 401 };
  }

  return { ok: true };
}
