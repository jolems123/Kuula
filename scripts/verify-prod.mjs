#!/usr/bin/env node
/**
 * Kuula — production readiness verification script.
 *
 * Run:  node scripts/verify-prod.mjs
 *
 * Checks every critical system before going live:
 *   1. Supabase database tables + RPCs
 *   2. Edge Function availability
 *   3. Webhook authentication
 *   4. Required env vars
 */

const SUPABASE_URL    = process.env.VITE_SUPABASE_URL     || "https://yuqhwjvmamjwklumlhtt.supabase.co";
const ANON_KEY        = process.env.VITE_SUPABASE_ANON_KEY || "";
const SERVICE_KEY     = process.env.VITE_SUPABASE_SERVICE_KEY || "";
const WEBHOOK_SECRET  = process.env.MARZPAY_WEBHOOK_SECRET || "";

let pass = 0, fail = 0, warn = 0;

function ok(label)    { console.log(`  ✅  ${label}`); pass++; }
function ko(label)    { console.log(`  ❌  ${label}`); fail++; }
function wn(label)    { console.log(`  ⚠️   ${label}`); warn++; }

async function get(path, key = ANON_KEY) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => ({ status: 0 }));
  return r.status;
}

async function fnPost(name, body = {}, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST", headers, body: JSON.stringify(body),
  }).catch(() => ({ status: 0, json: async () => ({}) }));
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── 1. Required environment variables ────────────────────────────────────────
console.log("\n── Environment variables ─────────────────────────────────────");
process.env.VITE_SUPABASE_URL     ? ok("VITE_SUPABASE_URL is set")      : ko("VITE_SUPABASE_URL missing");
process.env.VITE_SUPABASE_ANON_KEY? ok("VITE_SUPABASE_ANON_KEY is set") : ko("VITE_SUPABASE_ANON_KEY missing");
process.env.VITE_USE_API === "true"? ok("VITE_USE_API=true")             : wn("VITE_USE_API is not 'true' — app uses demo mode");
process.env.VITE_BACKEND === "supabase"? ok("VITE_BACKEND=supabase")     : wn("VITE_BACKEND is not 'supabase'");
WEBHOOK_SECRET                    ? ok("MARZPAY_WEBHOOK_SECRET is set")  : ko("MARZPAY_WEBHOOK_SECRET missing — webhooks will be rejected");
process.env.MARZPAY_API_KEY       ? ok("MARZPAY_API_KEY is set")         : wn("MARZPAY_API_KEY not in local env (set as Supabase Edge Function secret)");
process.env.MARZPAY_API_SECRET    ? ok("MARZPAY_API_SECRET is set")      : wn("MARZPAY_API_SECRET not in local env (set as Supabase Edge Function secret)");

// ── 2. Supabase database tables ───────────────────────────────────────────────
console.log("\n── Database tables ───────────────────────────────────────────");
const tables = ["profiles","wallets","savings_accounts","loan_applications","repayments","transactions","savings_goals","notifications","messages"];
for (const t of tables) {
  const s = await get(`${t}?limit=0`);
  s === 200 ? ok(`${t}`) : ko(`${t} → ${s}`);
}

// ── 3. Supabase RPCs ──────────────────────────────────────────────────────────
console.log("\n── Database RPCs (via OpenAPI) ───────────────────────────────");
// Use service key for OpenAPI — new sb_publishable_ format needs Authorization header
const specKey = SERVICE_KEY || ANON_KEY;
const spec = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: specKey, Authorization: `Bearer ${specKey}` },
}).then(r => r.json()).catch(() => ({}));
const allPaths = Object.keys(spec.paths || {});
const rpcs = allPaths.filter(p => p.includes("rpc")).map(p => p.replace(/.*rpc\//, ""));
// pay_repayment/topup_wallet are intentionally NOT client-callable since 0006
// (wallet-simulation paths revoked); only these must be exposed:
["is_admin","adjust_savings"].forEach(fn => {
  rpcs.includes(fn) ? ok(`RPC: ${fn}`) : ko(`RPC: ${fn} not found`);
});

// ── 4. Edge Functions ─────────────────────────────────────────────────────────
console.log("\n── Edge Functions ────────────────────────────────────────────");

// marzpay-webhook: expects 401 "invalid token" (secret IS set) or 503 "not configured" (secret missing)
const wh = await fnPost("marzpay-webhook", { test: true });
if (wh.status === 401 && wh.body?.error === "invalid token") {
  ok("marzpay-webhook deployed + MARZPAY_WEBHOOK_SECRET is set");
} else if (wh.status === 503) {
  ko("marzpay-webhook: MARZPAY_WEBHOOK_SECRET not set in Supabase secrets");
} else if (wh.status === 404) {
  ko("marzpay-webhook: NOT deployed");
} else {
  wn(`marzpay-webhook: unexpected status ${wh.status}`);
}

// webhook with correct secret → should return 200 {"received":true}
if (WEBHOOK_SECRET) {
  const wh2 = await fnPost(`marzpay-webhook?token=${encodeURIComponent(WEBHOOK_SECRET)}`, { reference: "TEST-VERIFY", isSuccess: true });
  wh2.status === 200 && wh2.body?.received ? ok("marzpay-webhook: secret matches Supabase config") : ko(`marzpay-webhook secret mismatch → ${wh2.status}`);
}

// marzpay-collect: expects 401 "UNAUTHORIZED_NO_AUTH_HEADER" (deployed, JWT required)
const col = await fnPost("marzpay-collect", {});
col.status === 401 ? ok("marzpay-collect deployed (auth required as expected)") : col.status === 404 ? ko("marzpay-collect NOT deployed") : wn(`marzpay-collect: ${col.status}`);

// marzpay-disburse
const dis = await fnPost("marzpay-disburse", {});
dis.status === 401 ? ok("marzpay-disburse deployed (auth required as expected)") : dis.status === 404 ? ko("marzpay-disburse NOT deployed") : wn(`marzpay-disburse: ${dis.status}`);

// credit-score
const cs = await fnPost("credit-score", {});
cs.status === 401 ? ok("credit-score deployed (auth required as expected)") : cs.status === 404 ? ko("credit-score NOT deployed — run: supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt") : wn(`credit-score: ${cs.status}`);

// auto-collect
const ac = await fnPost("auto-collect", {});
ac.status !== 404 ? ok(`auto-collect deployed → ${ac.status}`) : ko("auto-collect NOT deployed — run: supabase functions deploy --project-ref yuqhwjvmamjwklumlhtt");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n── Summary ───────────────────────────────────────────────────");
console.log(`  Passed : ${pass}`);
console.log(`  Warnings: ${warn}`);
console.log(`  Failed : ${fail}`);
if (fail === 0 && warn === 0) {
  console.log("\n  🚀 All checks passed. App is production-ready.\n");
} else if (fail === 0) {
  console.log("\n  ✅ No blocking issues. Review warnings before launch.\n");
} else {
  console.log(`\n  ❌ ${fail} blocking issue(s) must be fixed before launch.\n`);
  process.exit(1);
}
