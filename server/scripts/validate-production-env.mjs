const problems = [];
const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "OTP_PEPPER",
  "SMS_PROVIDER",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_API_KEY",
  "CORS_ORIGINS",
  "KYC_STORAGE_PROVIDER",
  "KYC_S3_BUCKET",
  "KYC_S3_REGION",
  "TRUST_PROXY_HOPS",
];

for (const name of required) {
  if (!String(process.env[name] ?? "").trim()) problems.push(`${name} is required`);
}

const db = String(process.env.DATABASE_URL ?? "");
if (!/^postgres(ql)?:\/\//i.test(db)) problems.push("DATABASE_URL must be PostgreSQL");
if (/localhost|127\.0\.0\.1|example\.(com|net|org)|<password>/i.test(db)) {
  problems.push("DATABASE_URL contains a local/example placeholder and cannot be used in production");
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

if (String(process.env.SMS_PROVIDER ?? "").trim().toLowerCase() !== "africastalking") {
  problems.push("SMS_PROVIDER must be africastalking in production");
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

console.log("Kuula production environment validation passed.");
