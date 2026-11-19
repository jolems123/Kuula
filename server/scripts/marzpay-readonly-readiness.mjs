/**
 * Kuula read-only MarzPay production readiness probe.
 * Sends only GET /balance?country=UG. Never performs a collection, payout,
 * refund, webhook replay, or configuration write. Does not print credentials
 * or financial balances. Use from an authorized runtime with configured env.
 */
import assert from "node:assert/strict";

const required = [
  "MARZPAY_API_KEY",
  "MARZPAY_API_SECRET",
  "MARZPAY_WEBHOOK_SECRET",
  "MARZPAY_WEBHOOK_SIGNATURE_SECRET",
  "PUBLIC_API_URL",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(JSON.stringify({ check: "marzpay_readiness", ok: false, missing }));
  process.exit(1);
}
if (process.env.MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN === "true") {
  console.error(JSON.stringify({ check: "marzpay_readiness", ok: false, reason: "query webhook authentication must be disabled" }));
  process.exit(1);
}
const api = new URL(process.env.PUBLIC_API_URL);
assert.equal(api.protocol, "https:", "PUBLIC_API_URL must be HTTPS");
assert.equal(api.hostname, "api.kuulapp.com", "Confirm the Kuula production webhook domain");
assert.ok(api.pathname === "/" || api.pathname === "", "PUBLIC_API_URL must be the origin, with no /api path");
const base = new URL(process.env.MARZPAY_BASE_URL || "https://wallet.wearemarz.com/api/v1");
assert.equal(base.protocol, "https:");
assert.equal(base.hostname, "wallet.wearemarz.com");
assert.equal((base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname), "/api/v1");
const auth = Buffer.from(process.env.MARZPAY_API_KEY.trim() + ":" + process.env.MARZPAY_API_SECRET.trim()).toString("base64");
try {
  const response = await fetch(new URL("/api/v1/balance?country=UG", base), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Basic " + auth },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  const account = payload?.data?.account ?? {};
  const status = account?.status ?? {};
  const sandbox = payload?.metadata?.sandbox_mode ?? payload?.data?.metadata?.sandbox_mode ?? payload?.meta?.sandbox_mode;
  const accountActive = String(status.account_status || "").toLowerCase() === "active" && status.is_frozen !== true;
  const balanceShapeValid = account?.available_balance?.raw != null && Number.isFinite(Number(account.available_balance.raw));
  // Never infer live readiness when the provider does not explicitly identify sandbox mode.
  const sandboxKnown = typeof sandbox === "boolean";
  const ok = response.ok && String(payload?.status || "").toLowerCase() === "success" && accountActive && balanceShapeValid && sandboxKnown;
  console.log(JSON.stringify({
    check: "marzpay_readiness",
    ok,
    httpStatus: response.status,
    accountActive,
    balanceShapeValid,
    sandboxMode: sandboxKnown ? sandbox : "unconfirmed",
    webhookUrl: api.origin + "/api/payments/marzpay/webhook",
    signatureConfigured: true,
    moneyMoved: false,
  }));
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ check: "marzpay_readiness", ok: false, error: error instanceof Error ? error.name : "unknown", moneyMoved: false }));
  process.exitCode = 1;
}
