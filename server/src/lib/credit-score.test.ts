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

test("credit score uses only verified credit and repayment factors", () => {
  const score = computeCreditScore(BASE);
  assert.deepEqual(score.factors.map((factor) => factor.key), ["momo", "crb", "kyc", "repayment"]);
  assert.equal(score.factors.reduce((sum, factor) => sum + factor.weightPercent, 0), 100);
});

test("stronger repayment and credit evidence improves the score", () => {
  const thin = computeCreditScore({ ...BASE, momoMonths: 1, momoTxnCount: 5, crbStatus: "thin", loansRepaid: 0, loansTotal: 1 });
  const strong = computeCreditScore({ ...BASE, momoMonths: 12, momoTxnCount: 150, crbStatus: "clean", loansRepaid: 4, loansTotal: 4 });
  assert.ok(strong.score > thin.score);
});
