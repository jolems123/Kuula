// Read-only MarzPay sandbox connectivity preflight. No payouts or collections.
// Run in an isolated environment with sandbox credentials. Never use production secrets.
// MARZPAY_BASE_URL=https://... MARZPAY_API_KEY=... MARZPAY_API_SECRET=... node scripts/marzpay-sandbox-preflight.mjs
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

const base = process.env.MARZPAY_BASE_URL?.trim().replace(/[/]+$/, "");
const key = process.env.MARZPAY_API_KEY?.trim();
const secret = process.env.MARZPAY_API_SECRET?.trim();
if (!base || !key || !secret) {
  console.error("FAIL: explicit sandbox base URL and isolated sandbox API credentials are required.");
  process.exit(2);
}
const u = new URL(base);
assert.equal(u.protocol, "https:", "Sandbox endpoint must use HTTPS");
assert.equal(u.username, "", "Endpoint URL cannot contain credentials");
assert.equal(u.password, "", "Endpoint URL cannot contain credentials");
assert.ok(u.pathname.endsWith("/api/v1"), "Expected explicit /api/v1 MarzPay URL");
assert.notEqual(process.env.NODE_ENV, "production", "Run preflight outside production");
assert.notEqual(process.env.REAL_MONEY_ENABLED, "true", "Preflight must not enable money movement");
const authorization = "Basic " + Buffer.from(key + ":" + secret).toString("base64");
const response = await fetch(base + "/balance?country=UG", {
  method: "GET",
  headers: { Accept: "application/json", Authorization: authorization },
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) {
  console.error(JSON.stringify({ check: "marzpay_sandbox_balance", status: "FAIL", httpStatus: response.status }));
  process.exit(1);
}
const body = await response.json();
const sandboxFlag = body?.metadata?.sandbox_mode ?? body?.data?.metadata?.sandbox_mode ?? body?.meta?.sandbox_mode;
if (sandboxFlag !== true) {
  console.error(JSON.stringify({ check: "marzpay_sandbox_balance", status: "FAIL", reason: "Sandbox mode not confirmed; no transaction tests permitted" }));
  process.exit(1);
}
const rawBalance = body?.data?.account?.available_balance?.raw;
assert.ok(rawBalance !== undefined && Number.isFinite(Number(rawBalance)), "Missing numeric spendable balance in response");
console.log(JSON.stringify({ check: "marzpay_sandbox_balance", status: "PASS", sandboxConfirmed: true, balanceShapeValid: true, moneyMoved: false }));
