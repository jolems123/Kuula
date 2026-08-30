import AfricasTalking from "africastalking";
import { normalizeUgandaMobileMoneyPhone } from "./marzpay.js";
import type { OtpPurpose } from "./otp.js";

interface SmsResult {
  accepted: boolean;
  provider: string;
  messageId?: string;
  detail?: string;
}

function provider(): string {
  return (process.env.SMS_PROVIDER?.trim() || "").toLowerCase();
}

function localDevEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.ALLOW_LOCAL_DEV_OTP === "true"
    && /^\d{6}$/.test(process.env.LOCAL_DEV_OTP_CODE?.trim() || "");
}

export function smsConfigured(): boolean {
  const selected = provider();
  if (selected === "test") return process.env.NODE_ENV === "test";
  if (selected === "local") return localDevEnabled();
  if (selected !== "africastalking") return false;
  return Boolean(
    process.env.AFRICASTALKING_USERNAME?.trim()
      && process.env.AFRICASTALKING_API_KEY?.trim()
  );
}

function messageFor(code: string, purpose: OtpPurpose): string {
  const action = purpose === "password_reset"
    ? "reset your Kuula password"
    : purpose === "admin_login"
      ? "complete Kuula staff sign in"
      : "verify your Kuula phone number";
  return `Your Kuula code is ${code}. Use it to ${action}. It expires in 10 minutes. Do not share this code.`;
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

  if (selected !== "africastalking") {
    throw new Error("SMS_PROVIDER must be africastalking outside approved test/local development modes");
  }

  const username = process.env.AFRICASTALKING_USERNAME?.trim() || "";
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim() || "";
  if (!username || !apiKey) {
    throw new Error("Africa's Talking SMS credentials are not configured");
  }

  const client = AfricasTalking({ username, apiKey });
  const payload: {
    to: string[];
    message: string;
    from?: string;
  } = {
    to: [phone],
    message: messageFor(code, purpose),
  };

  const senderId = process.env.AFRICASTALKING_SENDER_ID?.trim();
  if (senderId) payload.from = senderId;

  const response = await client.SMS.send(payload) as {
    SMSMessageData?: {
      Recipients?: Array<{
        status?: string;
        statusCode?: number;
        messageId?: string;
      }>;
      Message?: string;
    };
  };
  const recipient = response.SMSMessageData?.Recipients?.[0];
  const status = recipient?.status?.toLowerCase() || "";
  // Africa's Talking uses status code 101 / "Success" for an accepted SMS.
  // Do not interpret an unknown or empty provider status as successful.
  const accepted = Boolean(recipient) && (recipient?.statusCode === 101 || status === "success");

  return {
    accepted,
    provider: "africastalking",
    messageId: recipient?.messageId,
    detail: recipient?.status || response.SMSMessageData?.Message,
  };
}
