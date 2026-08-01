import test from "node:test";
import assert from "node:assert/strict";
import { computeCreditScore } from "./credit-score.js";

const BASE = {
  momoMonths: 8,
  momoTxnCount: 60,
  crbStatus: "thin",
  kycVerified: true,
  loansRepaid: 1,
  loansTotal: 1,
};

test("legacy savings balances do not change the credit score", () => {
  const zero = computeCreditScore({ ...BASE, savingsBalance: 0 });
  const legacy = computeCreditScore({ ...BASE, savingsBalance: 50_000_000 });

  assert.deepEqual(legacy, zero);
  const savings = zero.factors.find((factor) => factor.key === "savings");
  assert.equal(savings?.ratingPercent, 50);
  assert.match(savings?.detail ?? "", /neutral/i);
});
