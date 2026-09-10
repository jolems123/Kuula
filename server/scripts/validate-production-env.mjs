const problems = [];
const warnings = [];
const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "OTP_PEPPER",
  "SMS_PROVIDER",
  "EGOSMS_USERNAME",
  "EGOSMS_PASSWORD",
  "CORS_ORIGINS",
  "KYC_STORAGE_PROVIDER",
  "KYC_S3_BUCKET",
  "KYC_S3_REGION",
  "TRUST_PROXY_HOPS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
  "COMPLAINTS_EMAIL",
  "PRIVACY_EMAIL",
];

for (const name of required) {
  if (!String(process.env[name] ?? "").trim()) problems.push(`${name} is required`);
}

const db = String(process.env.DATABASE_URL ?? "");
if (!/^postgres(ql)?:\/\//i.test(db)) problems.push("DATABASE_URL must be PostgreSQL");
if (/localhost|127\.0\.0\.1|example\.(com|net|org)|<password>/i.test(db)) {
  problems.push("DATABASE_URL contains a local/example placeholder and cannot be used in production");
}
try {
  const url = new URL(db);
  for (const [name, min, max] of [["connection_limit", 1, 50], ["pool_timeout", 1, 120]]) {
    const raw = url.searchParams.get(name);
    if (!raw) {
      warnings.push(`DATABASE_URL does not set ${name}; the API will apply a conservative runtime default`);
      continue;
    }
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < min || value > max) {
      problems.push(`DATABASE_URL ${name} must be an integer from ${min} to ${max}`);
    }
  }
} catch {
  if (db) problems.push("DATABASE_URL must be a valid URL");
}

const jwt = String(process.env.JWT_SECRET ?? "");
const otp = String(process.env.OTP_PEPPER ?? "");
if (jwt.length < 64) problems.push("JWT_SECRET must be at least 64 characters");
if (otp.length < 64) problems.push("OTP_PEPPER must be at least 64 characters");
if (jwt && otp && jwt === otp) problems.push("OTP_PEPPER must be different from JWT_SECRET");

const trustProxyRaw = String(process.env.TRUST_PROXY_HOPS ?? "").trim();
const trustProxyHops = Number(trustProxyRaw);
if (!/^\d+$/.test(trustProxyRaw) || !Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  problems.push("TRUST_PROXY_HOPS must be an integer from 0 to 5 matching the exact production proxy topology");
}

const smtpPortRaw = String(process.env.SMTP_PORT ?? "").trim();
const smtpPort = Number(smtpPortRaw);
if (!/^\d+$/.test(smtpPortRaw) || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
  problems.push("SMTP_PORT must be a valid TCP port");
}
for (const name of ["SMTP_USER", "EMAIL_FROM", "SUPPORT_EMAIL", "COMPLAINTS_EMAIL", "PRIVACY_EMAIL"]) {
  const value = String(process.env[name] ?? "").trim();
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) problems.push(`${name} must be a valid email address`);
}
if (String(process.env.EMAIL_FROM ?? "").trim().toLowerCase() !== "notifications@kuulapp.com") {
  problems.push("EMAIL_FROM must be notifications@kuulapp.com for the Kuula production sender");
}

if (String(process.env.SMS_PROVIDER ?? "").trim().toLowerCase() !== "egosms") {
  problems.push("SMS_PROVIDER must be egosms in production");
}
const egosmsApiUrl = String(process.env.EGOSMS_API_URL ?? "").trim();
if (egosmsApiUrl) {
  try {
    if (new URL(egosmsApiUrl).protocol !== "https:") problems.push("EGOSMS_API_URL must use https");
  } catch {
    problems.push("EGOSMS_API_URL must be a valid absolute URL");
  }
}
if (String(process.env.KYC_STORAGE_PROVIDER ?? "").trim().toLowerCase() !== "s3") {
  problems.push("KYC_STORAGE_PROVIDER must be s3 in production");
}
if (process.env.TEST_OTP_CODE) problems.push("TEST_OTP_CODE must not be configured in production");
if (String(process.env.ALLOW_LOCAL_DEV_OTP ?? "").toLowerCase() === "true") {
  problems.push("ALLOW_LOCAL_DEV_OTP must not be enabled in production");
}
if (String(process.env.MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN ?? "").toLowerCase() === "true") {
  problems.push("MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN must be false in production");
}

const marzPayBaseUrl = String(process.env.MARZPAY_BASE_URL ?? "https://wallet.wearemarz.com/api/v1").trim();
try {
  const url = new URL(marzPayBaseUrl);
  if (url.protocol !== "https:" || url.hostname !== "wallet.wearemarz.com") {
    problems.push("MARZPAY_BASE_URL must use https://wallet.wearemarz.com in production");
  }
} catch {
  problems.push("MARZPAY_BASE_URL must be a valid absolute URL");
}

if (String(process.env.REAL_MONEY_ENABLED ?? "").toLowerCase() === "true") {
  for (const name of [
    "MARZPAY_API_KEY",
    "MARZPAY_API_SECRET",
    "MARZPAY_WEBHOOK_SECRET",
    "MARZPAY_WEBHOOK_SIGNATURE_SECRET",
    "PUBLIC_API_URL",
  ]) {
    if (!String(process.env[name] ?? "").trim()) problems.push(`${name} is required when REAL_MONEY_ENABLED=true`);
  }
  try {
    const url = new URL(String(process.env.PUBLIC_API_URL ?? ""));
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
      problems.push("PUBLIC_API_URL must be a public HTTPS URL when REAL_MONEY_ENABLED=true");
    }
  } catch {
    problems.push("PUBLIC_API_URL is invalid when REAL_MONEY_ENABLED=true");
  }
}

if (problems.length) {
  console.error("Kuula production environment validation failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`Kuula production environment warning: ${warning}`);

console.log("Kuula production environment validation passed.");
