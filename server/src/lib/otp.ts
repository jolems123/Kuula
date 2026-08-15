import crypto from "node:crypto";

export type OtpPurpose = "phone_verify" | "password_reset" | "admin_login";

export const OTP_POLICY = {
  expiresMinutes: 10,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  lockMinutes: 15,
} as const;

function otpPepper(): string {
  const pepper = process.env.OTP_PEPPER?.trim() || "";
  if (!pepper) {
    if (process.env.NODE_ENV === "test") return "ci-only-otp-pepper-not-for-production";
    throw new Error("OTP_PEPPER is required");
  }
  if (process.env.NODE_ENV === "production" && pepper.length < 32) {
    throw new Error("OTP_PEPPER must contain at least 32 characters in production");
  }
  return pepper;
}

function localDevOtp(): string {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_LOCAL_DEV_OTP !== "true") return "";
  const code = process.env.LOCAL_DEV_OTP_CODE?.trim() || "";
  if (code && !/^\d{6}$/.test(code)) throw new Error("LOCAL_DEV_OTP_CODE must contain six digits");
  return code;
}

export function generateOtpCode(): string {
  const fixed = process.env.TEST_OTP_CODE?.trim() || "";
  if (fixed) {
    if (process.env.NODE_ENV !== "test" || !/^\d{6}$/.test(fixed)) {
      throw new Error("TEST_OTP_CODE is allowed only in test and must contain six digits");
    }
    return fixed;
  }
  const local = localDevOtp();
  if (local) return local;
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(userId: string, purpose: OtpPurpose, code: string): string {
  return crypto
    .createHmac("sha256", otpPepper())
    .update(userId)
    .update("\0")
    .update(purpose)
    .update("\0")
    .update(code)
    .digest("hex");
}

export function verifyOtpHash(
  expectedHash: string | null,
  userId: string,
  purpose: OtpPurpose,
  code: string
): boolean {
  if (!expectedHash || !/^\d{6}$/.test(code)) return false;
  const actual = Buffer.from(hashOtp(userId, purpose, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function otpExpiry(from = new Date()): Date {
  return new Date(from.getTime() + OTP_POLICY.expiresMinutes * 60_000);
}

export function otpLockExpiry(from = new Date()): Date {
  return new Date(from.getTime() + OTP_POLICY.lockMinutes * 60_000);
}

export function validateNewPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8 || password.length > 72) {
    throw new RangeError("Password must contain between 8 and 72 characters");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new RangeError("Password must contain at least one letter and one number");
  }
  return password;
}
