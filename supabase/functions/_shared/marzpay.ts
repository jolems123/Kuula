// MarzPay Uganda client for Edge Functions (Deno).
//
// MarzPay (https://wallet.wearemarz.com) is a single mobile-money aggregator
// that routes to MTN MoMo and Airtel Money by phone number. Money movement is
// ASYNC: a successful API response only means the request was accepted — the
// customer still approves the prompt on their phone, and the final outcome is
// delivered to our webhook (see marzpay-webhook).
//
// Secrets (set as Edge Function secrets, never in the browser):
//   MARZPAY_API_KEY, MARZPAY_API_SECRET, [MARZPAY_BASE_URL], [MARZPAY_WEBHOOK_SECRET]

const BASE = (Deno.env.get("MARZPAY_BASE_URL") ?? "https://wallet.wearemarz.com/api/v1").replace(/\/+$/, "");
const KEY = Deno.env.get("MARZPAY_API_KEY") ?? "";
const SECRET = Deno.env.get("MARZPAY_API_SECRET") ?? "";

/** True only when both API credentials are present. */
export function marzConfigured(): boolean {
  return Boolean(KEY && SECRET);
}

/** Normalise any Ugandan number to the local 0XXXXXXXXX form MarzPay expects. */
export function toLocalPhone(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("256")) d = d.slice(3);
  if (d.length === 9) d = "0" + d; // 7XXXXXXXX -> 07XXXXXXXX
  return d;
}

function authHeader(): string {
  return "Basic " + btoa(`${KEY}:${SECRET}`);
}

export interface MarzResult {
  ok: boolean; // request was accepted by MarzPay (NOT final settlement)
  status: string; // provider status string
  uuid: string; // provider transaction reference
  message: string;
  raw: unknown;
}

async function post(path: string, body: Record<string, unknown>): Promise<MarzResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": authHeader(),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: "failed", uuid: "", message: `MarzPay unreachable: ${(err as Error).message}`, raw: null };
  }
  let data: Record<string, unknown> = {};
  try { data = await res.json() as Record<string, unknown>; } catch { /* non-JSON body */ }
  const d = (data?.data ?? {}) as Record<string, unknown>;
  const txn = (d?.transaction ?? {}) as Record<string, unknown>;
  const uuid = String(txn?.uuid ?? d?.uuid ?? data?.uuid ?? "");
  const status = String(txn?.status ?? data?.status ?? (res.ok ? "pending" : "failed"));
  const ok = res.ok && (data?.success !== false);
  const message = String(data?.message ?? (ok ? "accepted" : `MarzPay ${path} failed (${res.status})`));
  return { ok, status, uuid, message, raw: data };
}

export interface MarzMoneyArgs {
  phone: string;
  amount: number;
  reference: string;
  description?: string;
  callbackUrl?: string;
}

/** Send money to a customer's mobile-money wallet (loan disbursement). */
export function marzDisburse(p: MarzMoneyArgs): Promise<MarzResult> {
  return post("/disbursements", {
    phone_number: toLocalPhone(p.phone),
    amount: Math.round(p.amount),
    country: "UG",
    description: p.description ?? "Kuula loan disbursement",
    reference: p.reference,
    ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
  });
}

/** Collect money from a customer's mobile-money wallet (loan repayment). */
export function marzCollect(p: MarzMoneyArgs): Promise<MarzResult> {
  return post("/collections", {
    phone_number: toLocalPhone(p.phone),
    amount: Math.round(p.amount),
    country: "UG",
    description: p.description ?? "Kuula loan repayment",
    reference: p.reference,
    ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
  });
}

/** Public URL MarzPay should POST async results to. */
export function webhookUrl(supabaseUrl: string): string {
  const secret = Deno.env.get("MARZPAY_WEBHOOK_SECRET") ?? "";
  const base = `${supabaseUrl}/functions/v1/marzpay-webhook`;
  return secret ? `${base}?token=${encodeURIComponent(secret)}` : base;
}
