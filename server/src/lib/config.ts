/**
 * Centralised server configuration.
 *
 * Every externally-configurable secret is read exactly once, here, and the
 * production posture is validated at boot. The point is that a production
 * deployment can NEVER silently fall back to simulated payments or
 * console-logged OTPs — the process refuses to start instead.
 */

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

function bool(key: string, fallback: boolean): boolean {
  const raw = env(key);
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export const NODE_ENV = env("NODE_ENV", "development");
export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_TEST = NODE_ENV === "test";

export const config = {
  // ── Payments (MarzPay) ────────────────────────────────────────────────────
  marzpay: {
    baseUrl: env("MARZPAY_BASE_URL", "https://wallet.wearemarz.com/api/v1").replace(/\/+$/, ""),
    apiKey: env("MARZPAY_API_KEY"),
    apiSecret: env("MARZPAY_API_SECRET"),
    /** Shared secret for callback authenticity. HMAC key or bearer token. */
    webhookSecret: env("MARZPAY_WEBHOOK_SECRET"),
    /** "hmac" (preferred) or "token" (legacy shared-secret query/header). */
    webhookMode: (env("MARZPAY_WEBHOOK_MODE", "hmac") === "token" ? "token" : "hmac") as "hmac" | "token",
    /** Reject signed callbacks whose timestamp is outside this window. */
    webhookToleranceSec: Number(env("MARZPAY_WEBHOOK_TOLERANCE_SEC", "300")),
    /**
     * When true the server re-queries MarzPay for the transaction's real status
     * instead of trusting the callback body. A raw SUCCESS field alone never
     * settles money.
     */
    verifyCallbacks: bool("MARZPAY_VERIFY_CALLBACKS", true),
    timeoutMs: Number(env("MARZPAY_TIMEOUT_MS", "20000")),
  },

  /** Publicly reachable base URL MarzPay POSTs callbacks to. */
  publicApiBaseUrl: env("PUBLIC_API_BASE_URL").replace(/\/+$/, ""),

  // ── SMS / OTP ─────────────────────────────────────────────────────────────
  sms: {
    /** "egosms" | "log" */
    provider: env("SMS_PROVIDER", IS_PRODUCTION ? "" : "log"),
    username: env("SMS_USERNAME"),
    password: env("SMS_PASSWORD"),
    senderId: env("SMS_SENDER_ID", "KUULA"),
    baseUrl: env("SMS_BASE_URL"),
    timeoutMs: Number(env("SMS_TIMEOUT_MS", "15000")),
  },

  otp: {
    length: 6,
    ttlMs: Number(env("OTP_TTL_SECONDS", "300")) * 1000,
    maxAttempts: Number(env("OTP_MAX_ATTEMPTS", "5")),
    resendCooldownMs: Number(env("OTP_RESEND_COOLDOWN_SECONDS", "60")) * 1000,
    /** Max OTP requests per phone per hour. */
    maxPerHour: Number(env("OTP_MAX_PER_HOUR", "5")),
    /** Server-side pepper mixed into the OTP hash. */
    pepper: env("OTP_PEPPER") || env("JWT_SECRET"),
  },

  // ── Sessions ──────────────────────────────────────────────────────────────
  auth: {
    jwtSecret: env("JWT_SECRET"),
    /** Short-lived: the access token is held in memory by the client only. */
    accessTokenTtl: env("ACCESS_TOKEN_TTL", "15m"),
    refreshTokenTtlMs: Number(env("REFRESH_TOKEN_TTL_DAYS", "30")) * 86_400_000,
    /** Cookie domain for the web refresh cookie. Empty = host-only. */
    cookieDomain: env("SESSION_COOKIE_DOMAIN"),
    cookieSecure: bool("SESSION_COOKIE_SECURE", IS_PRODUCTION),
  },
} as const;

/** True only when MarzPay can actually be called. */
export function paymentsConfigured(): boolean {
  return Boolean(config.marzpay.apiKey && config.marzpay.apiSecret);
}

/** True only when a real SMS provider (not the dev logger) is wired up. */
export function smsConfigured(): boolean {
  const p = config.sms.provider;
  if (!p || p === "log") return false;
  if (p === "egosms") return Boolean(config.sms.username && config.sms.password);
  return false;
}

/**
 * Fatal misconfigurations for the current environment. In production the caller
 * exits rather than serving a build that cannot move money or deliver OTPs.
 */
export function configErrors(): string[] {
  const errors: string[] = [];

  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be set and at least 32 characters.");
  }

  if (!IS_PRODUCTION) return errors;

  if (!paymentsConfigured()) {
    errors.push(
      "MARZPAY_API_KEY and MARZPAY_API_SECRET are required in production — " +
        "Kuula must not run without a real payment provider."
    );
  }
  if (!config.marzpay.webhookSecret) {
    errors.push(
      "MARZPAY_WEBHOOK_SECRET is required in production — unauthenticated payment " +
        "callbacks must never be accepted."
    );
  }
  if (!config.publicApiBaseUrl || !config.publicApiBaseUrl.startsWith("https://")) {
    errors.push("PUBLIC_API_BASE_URL must be a public https:// URL so MarzPay can deliver callbacks.");
  }
  if (!smsConfigured()) {
    errors.push(
      "A real SMS provider is required in production (SMS_PROVIDER + credentials) — " +
        "OTPs must not be console-logged."
    );
  }
  if (!config.otp.pepper || config.otp.pepper.length < 32) {
    errors.push("OTP_PEPPER must be set to a strong random value in production.");
  }
  if (config.marzpay.webhookMode === "token") {
    errors.push(
      "MARZPAY_WEBHOOK_MODE=token uses a bearer secret instead of HMAC signatures. " +
        "Provision HMAC callback signing with MarzPay before going live."
    );
  }

  return errors;
}
