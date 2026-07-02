/**
 * Strongly-typed env config. Reads process.env once at boot; missing required
 * values fail fast with a clear message instead of failing later in a request.
 */
import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const v = optional(name);
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  env: optional("NODE_ENV", "development"),
  isProd: optional("NODE_ENV", "development") === "production",
  isTest: optional("NODE_ENV", "development") === "test",
  port: int("PORT", 3000),
  logLevel: optional("LOG_LEVEL", "info"),

  db: {
    url: required("DATABASE_URL", "postgres://kuula:kuula@localhost:5432/kuula"),
    autoMigrate: bool("AUTO_MIGRATE", true),
  },

  auth: {
    jwtSecret: required("JWT_SECRET", "dev-only-secret-change-me-please-32chars-min"),
    accessTtl: optional("ACCESS_TOKEN_TTL", "15m"),
    refreshTtl: optional("REFRESH_TOKEN_TTL", "30d"),
    issuer: optional("JWT_ISSUOR", "kuula-api"),
    audience: optional("JWT_AUDIENCE", "kuula-app"),
    argon2: {
      memoryKib: int("ARGON2_MEMORY_KIB", 19456),
      timeCost: int("ARGON2_TIME_COST", 2),
      parallelism: int("ARGON2_PARALLELISM", 1),
    },
  },

  cors: {
    origins: list("CORS_ORIGIN", [
      "http://localhost:5173",
      "http://localhost:4173",
      "capacitor://localhost",
      "http://localhost",
    ]),
  },

  rateLimit: {
    windowMs: int("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: int("RATE_LIMIT_MAX", 300),
    authMax: int("AUTH_RATE_LIMIT_MAX", 10),
  },

  otp: {
    ttlMs: int("OTP_TTL_MS", 10 * 60 * 1000),
    length: int("OTP_LENGTH", 6),
    debug: bool("DEBUG_OTP", true),
  },

  sms: {
    username: optional("AT_USERNAME", "kuula"),
    apiKey: optional("AT_API_KEY", ""),
    senderId: optional("AT_SENDER_ID", "KUULA"),
    shortCode: optional("AT_SHORT_CODE", ""),
  },

  mtn: {
    baseUrl: optional("MTN_BASE_URL", "https://sandbox.momodeveloper.mtn.com"),
    apiUser: optional("MTN_API_USER", ""),
    apiKey: optional("MTN_API_KEY", ""),
    subscriptionKey: optional("MTN_SUBSCRIPTION_KEY", ""),
    targetEnvironment: optional("MTN_TARGET_ENVIRONMENT", "sandbox"),
    callbackUrl: optional("MTN_CALLBACK_URL", "https://api.kuula.ug/mtn/callback"),
  },

  airtel: {
    baseUrl: optional("AIRTEL_BASE_URL", "https://openapiuat.airtel.africa"),
    clientId: optional("AIRTEL_CLIENT_ID", ""),
    clientSecret: optional("AIRTEL_CLIENT_SECRET", ""),
    callbackUrl: optional("AIRTEL_CALLBACK_URL", "https://api.kuula.ug/airtel/callback"),
  },

  app: {
    version: optional("APP_VERSION", "1.0.0"),
    publicUrl: optional("PUBLIC_APP_URL", "https://kuula.ug"),
    supportEmail: optional("SUPPORT_EMAIL", "support@kuula.ug"),
    supportPhone: optional("SUPPORT_PHONE", "+256700000001"),
  },

  compliance: {
    maxApr: Number(optional("COMPLIANCE_MAX_APR", "0.336")),
    appleCap: Number(optional("COMPLIANCE_APPLE_CAP", "0.36")),
    minTermDays: int("COMPLIANCE_MIN_TERM_DAYS", 90),
    googleMinTermDays: int("COMPLIANCE_GOOGLE_MIN_TERM_DAYS", 61),
    savingsApr: Number(optional("COMPLIANCE_SAVINGS_APR", "0.05")),
    savingsDiscount: Number(optional("COMPLIANCE_SAVINGS_DISCOUNT", "0.05")),
    savingsThreshold: int("COMPLIANCE_SAVINGS_THRESHOLD", 100000),
  },
} as const;

export type Config = typeof config;
