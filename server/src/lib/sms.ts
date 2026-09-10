import { normalizeUgandaMobileMoneyPhone } from "./marzpay.js";
import type { OtpPurpose } from "./otp.js";

interface SmsResult {
  accepted: boolean;
  provider: string;
  messageId?: string;
  detail?: string;
}

const DEFAULT_EGOSMS_API_URL = "https://comms.egosms.co/api/v1/json/";
const SMS_TIMEOUT_MS = 15_000;

function provider(): string {
  return (process.env.SMS_PROVIDER?.trim() || "").toLowerCase();
}

function localDevEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.ALLOW_LOCAL_DEV_OTP === "true"
    && /^\d{6}$/.test(process.env.LOCAL_DEV_OTP_CODE?.trim() || "");
}

function egosmsConfig(): { username: string; password: string; senderId: string; apiUrl: string } | null {
  const username = process.env.EGOSMS_USERNAME?.trim() || "";
  const password = process.env.EGOSMS_PASSWORD?.trim() || "";
  if (!username || !password) return null;
  return {
    username,
    password,
    // EgoSMS sender IDs are registered per account and capped at 11 chars.
    senderId: (process.env.EGOSMS_SENDER_ID?.trim() || "Kuula").slice(0, 11),
    apiUrl: process.env.EGOSMS_API_URL?.trim() || DEFAULT_EGOSMS_API_URL,
  };
}

export function smsConfigured(): boolean {
  const selected = provider();
  if (selected === "test") return process.env.NODE_ENV === "test";
  if (selected === "local") return localDevEnabled();
  if (selected !== "egosms") return false;
  return egosmsConfig() !== null;
}

function messageFor(code: string, purpose: OtpPurpose): string {
  const action = purpose === "password_reset"
    ? "reset your Kuula password"
    : purpose === "admin_login"
      ? "complete Kuula staff sign in"
      : purpose === "staff_invite"
        ? "activate your Kuula staff account"
        : "verify your Kuula phone number";
  return `Your Kuula code is ${code}. Use it to ${action}. It expires in 10 minutes. Do not share this code.`;
}

interface EgoSmsResponse {
  Status?: string;
  Message?: string;
  Cost?: string;
  MsgFollowUpUniqueCode?: string;
}

async function sendViaEgoSms(phone: string, message: string): Promise<SmsResult> {
  const config = egosmsConfig();
  if (!config) throw new Error("EgoSMS credentials are not configured");

  // EgoSMS expects the number as digits with country code, no leading "+".
  const number = phone.replace(/^\+/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);
  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        method: "SendSms",
        userdata: { username: config.username, password: config.password },
        msgdata: [{ number, message, senderid: config.senderId }],
      }),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as EgoSmsResponse;
    const status = (data.Status || "").trim().toLowerCase();
    const accepted = response.ok && status === "ok";
    return {
      accepted,
      provider: "egosms",
      messageId: data.MsgFollowUpUniqueCode,
      // Never include the message body in the detail — it contains the OTP.
      detail: accepted ? undefined : (data.Message || `EgoSMS HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      accepted: false,
      provider: "egosms",
      detail: error instanceof Error ? `EgoSMS request failed: ${error.message}` : "EgoSMS request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendOtpSms(
  phoneInput: string,
  code: string,
  purpose: OtpPurpose
): Promise<SmsResult> {
  const phone = normalizeUgandaMobileMoneyPhone(phoneInput);
  const selected = provider();

  if (selected === "test" && process.env.NODE_ENV === "test") {
    return { accepted: true, provider: "test", messageId: `test-${Date.now()}` };
  }

  if (selected === "local" && localDevEnabled()) {
    // Local development intentionally suppresses external SMS. The fixed code is
    // supplied by the developer through LOCAL_DEV_OTP_CODE and is never logged.
    return { accepted: true, provider: "local", messageId: `local-${Date.now()}` };
  }

  if (selected !== "egosms") {
    throw new Error("SMS_PROVIDER must be egosms outside approved test/local development modes");
  }

  return sendViaEgoSms(phone, messageFor(code, purpose));
}
