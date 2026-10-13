import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://wallet.wearemarz.com/api/v1";
const MIN_AMOUNT_UGX = 500;
const MAX_AMOUNT_UGX = 10_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * What a money-movement request is known to have done:
 * - accepted: MarzPay took the request; the final result arrives by callback or status lookup.
 * - rejected: MarzPay definitely refused it; no money moved for this reference.
 * - unknown: timeout, network error, 5xx or a duplicate-reference answer. Money may have
 *   moved, so the transaction must stay open until MarzPay confirms its real status.
 */
export type MarzPayOutcome = "accepted" | "rejected" | "unknown";

export interface MarzPayResult {
  outcome: MarzPayOutcome;
  accepted: boolean;
  status: string;
  uuid: string;
  reference: string;
  providerReference: string;
  message: string;
  errorCode: string;
  /** MarzPay's fee for this transaction when the create response states it. */
  charge: number | null;
  raw: Record<string, unknown>;
}

export interface MarzPayMoneyInput {
  phone: string;
  amount: number;
  reference: string;
  description: string;
  callbackUrl: string;
}

export interface MarzPayWebhookEvent {
  /** Kuula's own reference. For send-money MarzPay returns it as provider_reference. */
  reference: string;
  /** The other reference MarzPay sent, used only as a lookup fallback. */
  alternateReference: string;
  kind: "disbursement" | "collection" | "unknown";
  uuid: string;
  status: string;
  eventType: string;
  amount: number | null;
  currency: string;
  charge: number | null;
  providerTransactionId: string;
  isSuccess: boolean;
  isFailure: boolean;
  isFinal: boolean;
  payload: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown): string { return value == null ? "" : String(value).trim(); }
function readAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const object = asObject(value);
  if (object.raw === undefined || object.raw === null || object.raw === "") return null;
  const raw = Number(object.raw);
  return Number.isFinite(raw) ? Math.round(raw) : null;
}
function readCurrency(...values: unknown[]): string {
  for (const value of values) {
    const currency = asString(asObject(value).currency).toUpperCase();
    if (currency) return currency;
  }
  return "";
}
export function marzPayBaseUrl(): string {
  const configured = (process.env.MARZPAY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(configured);
  if (process.env.NODE_ENV === "production" && (parsed.protocol !== "https:" || parsed.hostname !== "wallet.wearemarz.com")) {
    throw new Error("MARZPAY_BASE_URL is not an approved production endpoint");
  }
  return configured;
}
function credentials(): { key: string; secret: string } | null {
  const key = process.env.MARZPAY_API_KEY?.trim() || "";
  const secret = process.env.MARZPAY_API_SECRET?.trim() || "";
  return key && secret ? { key, secret } : null;
}

export function realMoneyEnabled(): boolean {
  return process.env.NODE_ENV === "test" || process.env.REAL_MONEY_ENABLED === "true";
}

export function marzPayConfigured(): boolean {
  return realMoneyEnabled() && credentials() !== null;
}

/** Status lookups move no money, so they need credentials but not the real-money switch. */
export function marzPayLookupConfigured(): boolean {
  return credentials() !== null;
}

export function normalizeUgandaMobileMoneyPhone(input: string): string {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `256${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) digits = `256${digits}`;
  const normalized = `+${digits}`;
  if (!/^\+2567\d{8}$/.test(normalized)) throw new RangeError("A valid Uganda mobile-money phone number is required");
  return normalized;
}

export function normalizeMarzPayAmount(value: number): number {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_UGX || amount > MAX_AMOUNT_UGX) {
    throw new RangeError(`Mobile-money amount must be between UGX ${MIN_AMOUNT_UGX.toLocaleString()} and UGX ${MAX_AMOUNT_UGX.toLocaleString()}`);
  }
  return amount;
}

export function createPaymentReference(): string { return crypto.randomUUID(); }

export function buildMarzPayWebhookUrl(): string {
  if (!realMoneyEnabled()) throw new Error("Real-money movement is disabled");
  const publicApiUrl = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, "") || "";
  if (!publicApiUrl) throw new Error("PUBLIC_API_URL is required for MarZPay callbacks");
  let parsed: URL;
  try { parsed = new URL(publicApiUrl); } catch { throw new Error("PUBLIC_API_URL must be a valid absolute URL"); }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("PUBLIC_API_URL must use HTTPS in production");
  return `${publicApiUrl}/api/payments/marzpay/webhook`;
}

function basicAuthorization(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`, "utf8").toString("base64")}`;
}

async function postMoney(path: "/send-money" | "/collect-money", input: MarzPayMoneyInput): Promise<MarzPayResult> {
  if (!realMoneyEnabled()) throw new Error("Real-money movement is disabled");
  const auth = credentials();
  if (!auth) throw new Error("MarZPay is not configured");
  if (!UUID_V4.test(input.reference)) throw new RangeError("MarZPay reference must be a UUID v4");

  const body = {
    phone_number: normalizeUgandaMobileMoneyPhone(input.phone),
    amount: normalizeMarzPayAmount(input.amount),
    country: "UG",
    reference: input.reference,
    description: input.description.slice(0, 255),
    callback_url: input.callbackUrl.slice(0, 255),
  };
  const unknown = (message: string, raw: Record<string, unknown> = {}, errorCode = ""): MarzPayResult => ({
    outcome: "unknown", accepted: false, status: "unknown", uuid: "", reference: "", providerReference: input.reference,
    message, errorCode, charge: null, raw,
  });

  let response: Response;
  try {
    response = await fetch(`${marzPayBaseUrl()}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: basicAuthorization(auth.key, auth.secret) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // The request may have reached MarzPay before the connection dropped.
    return unknown(`MarZPay did not answer: ${error instanceof Error ? error.message : "request failed"}`);
  }

  const payload = asObject(await response.json().catch(() => ({})));
  const data = asObject(payload.data);
  const transaction = asObject(data.transaction);
  const errorCode = asString(payload.error_code).toUpperCase();
  const message = asString(payload.message);
  if (response.status >= 500 || response.status === 408 || errorCode === "DUPLICATE_REFERENCE" || errorCode === "SERVER_ERROR") {
    return unknown(message || `MarzPay returned HTTP ${response.status}`, payload, errorCode);
  }
  if (!response.ok || asString(payload.status).toLowerCase() === "error" || payload.success === false) {
    return {
      outcome: "rejected", accepted: false, status: "rejected", uuid: asString(transaction.uuid), reference: "",
      providerReference: input.reference, message: message || `MarzPay returned HTTP ${response.status}`, errorCode,
      charge: null, raw: payload,
    };
  }
  // Live send-money answers with `withdrawal`; sandbox may use `disbursement`.
  const money = { ...asObject(data.collection), ...asObject(data.disbursement), ...asObject(data.withdrawal) };
  return {
    outcome: "accepted",
    accepted: true,
    status: asString(transaction.status) || "processing",
    uuid: asString(transaction.uuid || data.uuid),
    reference: asString(transaction.reference),
    providerReference: asString(transaction.provider_reference),
    message: message || "Request accepted",
    errorCode,
    charge: readAmount(money.charge),
    raw: payload,
  };
}

export function sendMoney(input: MarzPayMoneyInput): Promise<MarzPayResult> { return postMoney("/send-money", input); }
export function collectMoney(input: MarzPayMoneyInput): Promise<MarzPayResult> { return postMoney("/collect-money", input); }

export function parseMarzPayWebhook(payloadInput: unknown): MarzPayWebhookEvent {
  const outer = asObject(payloadInput);
  // Dashboard webhooks wrap the callback body in `data`; per-request callbacks do not.
  const wrapped = asObject(outer.data);
  const payload = Object.keys(asObject(wrapped.transaction)).length
    ? { ...wrapped, event_type: wrapped.event_type ?? outer.event_type }
    : outer;
  const transaction = asObject(payload.transaction);
  const collection = asObject(payload.collection);
  const disbursement = asObject(payload.disbursement);
  const eventType = asString(payload.event_type || payload.eventType).toLowerCase();
  const status = asString(transaction.status || payload.status).toLowerCase();
  const kind: MarzPayWebhookEvent["kind"] = eventType.startsWith("disbursement") || (!eventType && Object.keys(disbursement).length > 0)
    ? "disbursement"
    : eventType.startsWith("collection") || (!eventType && Object.keys(collection).length > 0) ? "collection" : "unknown";
  const systemReference = asString(transaction.reference);
  const providerReference = asString(transaction.provider_reference);
  // Send-money: Kuula's reference comes back as provider_reference and `reference` is MarzPay's.
  const reference = kind === "disbursement" ? (providerReference || systemReference) : (systemReference || providerReference);
  const alternateReference = reference === systemReference ? providerReference : systemReference;
  const success = /completed|successful|success/.test(eventType) || /^(completed|successful|success)$/.test(status);
  const failure = /failed|failure|cancelled|canceled/.test(eventType) || /^(failed|cancelled|canceled)$/.test(status);
  const section = kind === "disbursement" ? disbursement : collection;
  return {
    reference,
    alternateReference,
    kind,
    uuid: asString(transaction.uuid || payload.uuid),
    status: status || (success ? "completed" : failure ? "failed" : "pending"),
    eventType,
    amount: readAmount(transaction.amount) ?? readAmount(section.amount) ?? readAmount(payload.amount),
    currency: readCurrency(transaction.amount, section.amount),
    charge: readAmount(transaction.charge) ?? readAmount(section.charge),
    providerTransactionId: asString(section.provider_transaction_id),
    isSuccess: success && !failure,
    isFailure: failure,
    isFinal: success || failure,
    payload: outer,
  };
}

export type MarzPayLookup =
  | { state: "found"; event: MarzPayWebhookEvent }
  | { state: "not_found" }
  | { state: "error"; message: string };

async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = credentials();
  if (!auth) throw new Error("MarZPay is not configured");
  const response = await fetch(`${marzPayBaseUrl()}${path}`, {
    headers: { Accept: "application/json", Authorization: basicAuthorization(auth.key, auth.secret) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { status: response.status, body: asObject(await response.json().catch(() => ({}))) };
}

function listItems(body: Record<string, unknown>): Record<string, unknown>[] {
  const data = body.data;
  const list = [data, asObject(data).transactions, asObject(data).data, body.transactions].find(Array.isArray) as unknown[] | undefined;
  return (list ?? []).map(asObject);
}

/**
 * Ask MarzPay what really happened to a transaction: GET /transactions/{uuid} (documented
 * to return a callback-shaped body) when MarzPay's id is known, otherwise a search with
 * GET /transactions?reference=. "not_found" never proves that a payment failed.
 */
export async function lookupMarzPayTransaction(input: { reference: string; uuid?: string | null }): Promise<MarzPayLookup> {
  try {
    let uuid = input.uuid?.trim() || "";
    if (!uuid) {
      const listed = await getJson(`/transactions?reference=${encodeURIComponent(input.reference)}`);
      if (listed.status >= 400) return { state: "error", message: `Transaction search returned HTTP ${listed.status}` };
      const match = listItems(listed.body).find((item) => asString(item.reference) === input.reference || asString(item.provider_reference) === input.reference);
      if (!match) return { state: "not_found" };
      uuid = asString(match.uuid);
      if (!uuid) return { state: "error", message: "Transaction search result has no uuid" };
    }
    const detail = await getJson(`/transactions/${encodeURIComponent(uuid)}`);
    if (detail.status === 404) return { state: "not_found" };
    if (detail.status >= 400) return { state: "error", message: `Transaction lookup returned HTTP ${detail.status}` };
    const event = parseMarzPayWebhook(detail.body);
    if (event.reference !== input.reference && event.alternateReference !== input.reference) {
      return { state: "error", message: "Transaction lookup returned a different reference" };
    }
    return { state: "found", event: { ...event, reference: input.reference, uuid: event.uuid || uuid } };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : "lookup failed" };
  }
}

export function secureTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual || "", "utf8");
  const expectedBuffer = Buffer.from(expected || "", "utf8");
  if (actualBuffer.length !== expectedBuffer.length || expectedBuffer.length === 0) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyMarzPayWebhookSignature(input: {
  rawBody: Buffer;
  timestamp: string;
  signatureHeader: string;
  secret: string;
  nowMs?: number;
}): boolean {
  if (!input.rawBody.length || !input.secret || !/^\d{10}$/.test(input.timestamp)) return false;
  const timestampMs = Number(input.timestamp) * 1000;
  if (Math.abs((input.nowMs ?? Date.now()) - timestampMs) > 5 * 60_000) return false;
  const received = /(?:^|,)v1=([a-f0-9]{64})(?:,|$)/i.exec(input.signatureHeader)?.[1] || "";
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}.`)
    .update(input.rawBody)
    .digest("hex");
  return secureTokenEquals(received.toLowerCase(), expected);
}
