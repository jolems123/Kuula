import type { User } from "@prisma/client";
import prisma from "./prisma.js";
import { AppError } from "../middleware/error-handler.js";
import { generateOtpCode, hashOtp, otpExpiry, OTP_POLICY, type OtpPurpose } from "./otp.js";
import { sendOtpSms, smsConfigured } from "./sms.js";

function cooldownSeconds(lastSentAt: Date | null, now = new Date()): number {
  if (!lastSentAt) return 0;
  const elapsed = now.getTime() - lastSentAt.getTime();
  return Math.max(0, Math.ceil((OTP_POLICY.resendCooldownSeconds * 1000 - elapsed) / 1000));
}

/**
 * Generate a fresh OTP for the user, persist only its keyed hash, and deliver
 * it by SMS. Shared by the auth routes and the staff invitation flow.
 */
export async function issueOtpForUser(user: User, purpose: OtpPurpose): Promise<void> {
  if (!smsConfigured()) throw new AppError("SMS verification is temporarily unavailable", 503);

  const now = new Date();
  if (user.otpLockedUntil && user.otpLockedUntil > now) {
    const seconds = Math.ceil((user.otpLockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(`Verification is locked. Try again in ${seconds} seconds.`, 429);
  }

  const retryAfter = cooldownSeconds(user.otpLastSentAt, now);
  if (retryAfter > 0) throw new AppError(`Wait ${retryAfter} seconds before requesting another code.`, 429);
  if (!user.phone) throw new AppError("A verified staff phone number is required for verification", 422);

  const code = generateOtpCode();
  const otpHash = hashOtp(user.id, purpose, code);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpHash,
      otpPurpose: purpose,
      otpExpiresAt: otpExpiry(now),
      otpAttempts: 0,
      otpLastSentAt: now,
      otpLockedUntil: null,
    },
  });

  try {
    const result = await sendOtpSms(user.phone, code, purpose);
    if (!result.accepted) throw new Error(result.detail || "SMS provider rejected the message");
  } catch (error) {
    await prisma.user.updateMany({
      where: { id: user.id, otpHash },
      // A provider failure must not start the resend cooldown. The customer
      // should be able to retry as soon as delivery is available again.
      data: { otpHash: null, otpPurpose: null, otpExpiresAt: null, otpLastSentAt: null },
    });
    console.error(JSON.stringify({
      event: "otp.delivery_failed",
      userId: user.id,
      purpose,
      error: error instanceof Error ? error.message : "Unknown SMS provider error",
    }));
    throw new AppError("Could not send the verification message. Try again later.", 503);
  }
}
