/**
 * Mobile-money providers — MTN MoMo and Airtel Money.
 *
 * Disbursement (pay out a loan) and collection (debit a repayment). API keys
 * come from server-side env only (MTN_API_KEY / AIRTEL_API_KEY) and are never
 * shipped to the client. When a key is absent the provider runs in SIMULATION
 * mode so the flow is testable offline; set the key to hit the real endpoint.
 *
 * NOTE: the real MTN MoMo API (momodeveloper.mtn.com) and Airtel Open API use
 * OAuth + subscription keys + an X-Reference-Id, not a single bearer token.
 * This module is structured so that exchange slots into `callProvider()`
 * without touching the loan logic; the request shape below matches the brief.
 */

const RETRY_DELAYS = [250, 750, 1500]; // 3 attempts, exponential-ish backoff
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeRef(prefix) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${d}-${Math.floor(100000 + Math.random() * 899999)}`;
}

async function callProvider({ name, baseUrl, apiKey, path, body, refPrefix }) {
  // Simulation mode — deterministic success so disbursement/collection can be
  // exercised end-to-end without live merchant credentials.
  if (!apiKey) {
    return { simulated: true, status: "success", transaction_id: makeRef(refPrefix) };
  }

  let lastErr;
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(baseUrl + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `${name} ${path} failed (${res.status})`);
      return {
        simulated: false,
        status: data.status ?? "success",
        transaction_id: data.transaction_id ?? makeRef(refPrefix),
      };
    } catch (err) {
      lastErr = err;
      console.error(`[${name}] attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < RETRY_DELAYS.length - 1) await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw new Error(`${name} unreachable after ${RETRY_DELAYS.length} attempts: ${lastErr?.message}`);
}

function provider({ name, baseEnv, keyEnv, defaultBase, refPrefix }) {
  const baseUrl = process.env[baseEnv] || defaultBase;
  const apiKey = process.env[keyEnv] || "";
  return {
    name,
    configured: Boolean(apiKey),
    disburse: (phoneNumber, amount, reference) =>
      callProvider({ name, baseUrl, apiKey, path: "/disbursement", refPrefix,
        body: { phoneNumber, amount: String(amount), reference, currency: "UGX" } }),
    collect: (phoneNumber, amount, transactionId) =>
      callProvider({ name, baseUrl, apiKey, path: "/collection", refPrefix,
        body: { phoneNumber, amount: String(amount), transactionId, currency: "UGX" } }),
  };
}

export const momo = provider({
  name: "MTN MoMo", baseEnv: "MTN_BASE_URL", keyEnv: "MTN_API_KEY",
  defaultBase: "https://api.momoyuganda.com/v1", refPrefix: "MTN",
});

export const airtel = provider({
  name: "Airtel Money", baseEnv: "AIRTEL_BASE_URL", keyEnv: "AIRTEL_API_KEY",
  defaultBase: "https://api.airtelmoney.ug/v1", refPrefix: "AIRTEL",
});

/** Pick the provider for a disbursement_method value. */
export function providerFor(method) {
  if (method === "airtel_money") return airtel;
  return momo; // mtn_momo and bank fall back to MTN rails for the demo
}
