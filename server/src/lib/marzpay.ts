import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://wallet.wearemarz.com/api/v1";
const MIN_AMOUNT_UGX = 500;
const MAX_AMOUNT_UGX = 10_000_000;
const REQUEST_TIMEOUT_MS = 20_000;

export interface MarzPayResult {
  accepted: boolean;
  status: string;
  uuid: string;
  reference: string;
  providerReference: string;
  message: string;
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
  reference: string;
  uuid: string;
  status: string;
  eventType: string;
  amount: number | null;
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
  const raw = Number(object.raw);
  return Number.isFinite(raw) ? Math.round(raw) : null;
}
function baseUrl(): string { return (process.env.MARZPAY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""); }
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.reference)) {
    throw new RangeError("MarZPay reference must be a UUID v4");
  }

  const form = new FormData();
  form.set("phone_number", normalizeUgandaMobileMoneyPhone(input.phone));
  form.set("amount", String(normalizeMarzPayAmount(input.amount)));
  form.set("country", "UG");
  form.set("reference", input.reference);
  form.set("description", input.description.slice(0, 255));
  form.set("callback_url", input.callbackUrl.slice(0, 255));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: basicAuthorization(auth.key, auth.secret) },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MarZPay request failed";
    return { accepted: false, status: "failed", uuid: "", reference: input.reference, providerReference: "", message: `MarZPay unreachable: ${message}`, raw: {} };
  } finally { clearTimeout(timeout); }

  const payload = asObject(await response.json().catch(() => ({})));
  const data = asObject(payload.data);
  const transaction = asObject(data.transaction);
  const status = asString(transaction.status || payload.status || (response.ok ? "processing" : "failed"));
  const accepted = response.ok && asString(payload.status).toLowerCase() !== "error" && payload.success !== false;
  return {
    accepted,
    status,
    uuid: asString(transaction.uuid || data.uuid || payload.uuid),
    reference: asString(transaction.reference || payload.reference || input.reference),
    providerReference: asString(transaction.provider_reference || transaction.providerReference),
    message: asString(payload.message) || (accepted ? "Request accepted" : `MarzPay returned HTTP ${response.status}`),
    raw: payload,
  };
}

export function sendMoney(input: MarzPayMoneyInput): Promise<MarzPayResult> { return postMoney("/send-money", input); }
export function collectMoney(input: MarzPayMoneyInput): Promise<MarzPayResult> { return postMoney("/collect-money", input); }

export function parseMarzPayWebhook(payloadInput: unknown): MarzPayWebhookEvent {
  const payload = asObject(payloadInput);
  const data = asObject(payload.data);
  const transaction = { ...asObject(data.transaction), ...asObject(payload.transaction) };
  const collection = { ...asObject(data.collection), ...asObject(payload.collection) };
  const disbursement = { ...asObject(data.disbursement), ...asObject(payload.disbursement) };
  const eventType = asString(payload.event_type || payload.eventType || data.event_type || data.eventType).toLowerCase();
  const status = asString(transaction.status || payload.status || data.status).toLowerCase();
  const reference = asString(transaction.reference || payload.reference || data.reference);
  const uuid = asString(transaction.uuid || payload.uuid || data.uuid);
  const success = /completed|successful|success/.test(eventType) || /^(completed|successful|success)$/.test(status);
  const failure = /failed|cancelled|canceled/.test(eventType) || /^(failed|cancelled|canceled)$/.test(status);
  const amount = readAmount(transaction.amount) ?? readAmount(collection.amount) ?? readAmount(disbursement.amount) ?? readAmount(payload.amount);
  return { reference, uuid, status: status || (success ? "completed" : failure ? "failed" : "pending"), eventType, amount, isSuccess: success, isFailure: failure, isFinal: success || failure, payload };
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
