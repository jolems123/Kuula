import assert from "node:assert/strict";
import test from "node:test";
import { splitDisbursementAmount } from "./disbursements.js";

test("keeps a facility in one leg when it is within the provider limit", () => {
  assert.deepEqual(splitDisbursementAmount(2_000_000, 5_000_000), [2_000_000]);
});

test("splits an eight million facility into sequential five and three million legs", () => {
  assert.deepEqual(splitDisbursementAmount(8_000_000, 5_000_000), [5_000_000, 3_000_000]);
});

test("never creates a final leg below the provider minimum", () => {
  assert.deepEqual(splitDisbursementAmount(5_000_100, 5_000_000, 500), [4_999_600, 500]);
});

test("preserves the exact approved amount across many legs", () => {
  const legs = splitDisbursementAmount(15_750_000, 5_000_000, 500);
  assert.deepEqual(legs, [5_000_000, 5_000_000, 5_000_000, 750_000]);
  assert.equal(legs.reduce((sum, amount) => sum + amount, 0), 15_750_000);
  assert.ok(legs.every((amount) => amount <= 5_000_000));
});

test("a failed payout may only be retried once MarzPay confirms it did not pay out", async () => {
  const { assertLegSafeToRetry } = await import("./disbursements.js");
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.MARZPAY_API_KEY = "key";
  process.env.MARZPAY_API_SECRET = "secret";
  process.env.MARZPAY_BASE_URL = "https://wallet.example/api/v1";
  const reference = "6f1c8a52-3c1e-4a8e-9d55-0d4b8f3e2a11";
  const providerSays = (status: string | null) => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/transactions?reference=")) {
        return new Response(JSON.stringify({ status: "success", data: { transactions: status ? [{ uuid: "11111111-2222-4333-8444-555555555555", provider_reference: reference, status }] : [] } }));
      }
      return new Response(JSON.stringify({ event_type: `disbursement.${status}`, transaction: { uuid: "11111111-2222-4333-8444-555555555555", reference: "sys", provider_reference: reference, status } }));
    };
  };
  try {
    providerSays("completed");
    await assert.rejects(assertLegSafeToRetry({ reference, provider_status: "unknown", provider_transaction_id: null }), /must not be sent again/);
    providerSays("processing");
    await assert.rejects(assertLegSafeToRetry({ reference, provider_status: "unknown", provider_transaction_id: null }), /must not be sent again/);
    providerSays(null);
    await assert.rejects(assertLegSafeToRetry({ reference, provider_status: "unknown", provider_transaction_id: null }), /no record/);
    await assertLegSafeToRetry({ reference, provider_status: "rejected:INSUFFICIENT_BALANCE", provider_transaction_id: null });
    providerSays("failed");
    await assertLegSafeToRetry({ reference, provider_status: "unknown", provider_transaction_id: null });
    globalThis.fetch = async () => { throw new Error("network down"); };
    await assert.rejects(assertLegSafeToRetry({ reference, provider_status: "unknown", provider_transaction_id: null }), /Could not verify/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
