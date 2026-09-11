/**
 * SMS delivery (C-04).
 *
 * Replaces `console.log("[DEV] OTP for …")` with a real provider.
 *
 * EgoSMS is the default driver — a Ugandan aggregator that reaches MTN and
 * Airtel subscribers directly. The driver interface is deliberately thin so a
 * different aggregator can be dropped in without touching the OTP logic.
 *
 * The `log` driver exists ONLY for local development and automated tests. It is
 * rejected at boot in production by `configErrors()`, so a production build can
 * never fall back to printing codes.
 */
import { config, IS_PRODUCTION, smsConfigured } from "./config.js";

export { smsConfigured };

export interface SmsResult {
  ok: boolean;
  /** Provider message id, when supplied. */
  ref: string | null;
  error?: string;
}

export interface SentSms {
  to: string;
  body: string;
}

/**
 * Messages captured by the `log`/test driver. Tests assert on delivery without
 * ever needing the OTP service to return a plaintext code.
 */
export const sentMessages: SentSms[] = [];

/** Normalise a Ugandan number to E.164 (+256XXXXXXXXX) for the SMS gateway. */
export function toE164(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("256")) d = "256" + d;
  return "+" + d;
}

async function sendViaEgoSms(to: string, body: string): Promise<SmsResult> {
  const base = config.sms.baseUrl || "https://comms.egosms.co/api/v1/json/";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sms.timeoutMs);

  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        method: "SendSms",
        userdata: { username: config.sms.username, password: config.sms.password },
        // EgoSMS wants the international number without the leading "+".
        msgdata: [{ number: to.replace(/^\+/, ""), message: body, senderid: config.sms.senderId || undefined, priority: 0 }],
      }),
      signal: controller.signal,
    });

    // EgoSMS answers HTTP 200 even on failure; only `Status` is authoritative.
    const data = (await res.json().catch(() => ({}))) as {
      Status?: string;
      Message?: string;
      MsgFollowUpUniqueCode?: string;
    };
    const ok = res.ok && data?.Status === "OK";

    return {
      ok,
      ref: data?.MsgFollowUpUniqueCode ?? null,
      // Never include the message body in the error — it contains the OTP.
      error: ok ? undefined : `provider status ${data?.Status ?? res.status}${data?.Message ? `: ${data.Message}` : ""}`,
    };
  } catch (err) {
    return { ok: false, ref: null, error: `sms provider unreachable: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send an SMS.
 *
 * `body` may contain an OTP, so it is never logged in production and never
 * echoed back into an error message.
 */
export async function sendSms(rawTo: string, body: string): Promise<SmsResult> {
  const to = toE164(rawTo);
  const provider = config.sms.provider;

  if (provider === "egosms") {
    return sendViaEgoSms(to, body);
  }

  if (!IS_PRODUCTION) {
    sentMessages.push({ to, body });
    if (sentMessages.length > 100) sentMessages.shift();
    // Development convenience only. `configErrors()` refuses to boot production
    // with the log driver, so this branch is unreachable in production.
    console.log(`[sms:dev] -> ${to}: ${body}`);
    return { ok: true, ref: `dev-${Date.now()}` };
  }

  return { ok: false, ref: null, error: "no SMS provider configured" };
}

/** Clear the captured dev/test outbox. */
export function resetSentMessages(): void {
  sentMessages.length = 0;
}
