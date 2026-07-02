/**
 * SMS / OTP delivery. Uses Africa's Talking (Uganda) when AT_API_KEY is set;
 * falls back to logging the OTP to the server console + returning it in the
 * API response (DEBUG_OTP=true) for local dev / CI.
 *
 * Refs: https://developers.africastalking.com/docs/sms
 */
import { config } from "../config.js";

export interface OtpDeliveryResult {
  delivered: boolean;
  channel: "africas-talking" | "console" | "debug";
}

export async function sendOtp(phone: string, code: string, purpose: string): Promise<OtpDeliveryResult> {
  const message = `Kuula: your ${purpose} code is ${code}. Valid for ${Math.floor(config.otp.ttlMs / 60000)} minutes. Never share this code.`;

  if (!config.sms.apiKey) {
    // Local dev / CI only. Never log PII (the phone number): when DEBUG_OTP is
    // on the code is returned in the API response for testing, so there's no
    // need to put the recipient or code on stdout.
    const shownCode = config.otp.debug ? code : "******";
    // eslint-disable-next-line no-console
    console.log(`[OTP] (no SMS provider configured) ${purpose} code generated → ${shownCode}`);
    return { delivered: true, channel: config.otp.debug ? "debug" : "console" };
  }

  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": config.sms.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        username: config.sms.username,
        to: phone.replace(/\D/g, ""),
        message,
        from: config.sms.senderId,
      }).toString(),
    });
    const data = await res.json().catch(() => ({})) as { SMSMessageData?: { MessageStatus?: string } };
    const ok = res.ok && data.SMSMessageData?.MessageStatus !== "InvalidPhoneNumber";
    return { delivered: ok, channel: "africas-talking" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[OTP] Africa's Talking failed:", err);
    return { delivered: false, channel: "console" };
  }
}
