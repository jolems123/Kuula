import test from "node:test";
import assert from "node:assert/strict";
import { computeCreditScore } from "./credit-score.js";

const BASE = {
  momoMonths: 8,
  momoTxnCount: 60,
  momoVerified: true,
  kycVerified: true,
  loansRepaid: 1,
  loansTotal: 1,
};

test("scoring has only KYC, independently verified mobile-money evidence and Kuula repayments", () => {
  const score = computeCreditScore(BASE);
  assert.deepEqual(score.factors.map(f => f.key), ["kyc", "momo", "repayment"]);
  assert.equal(score.factors.reduce((sum, f) => sum + f.weightPercent, 0), 100);
  assert.equal(score.factors.some(f => /crb|bureau/i.test(f.key + f.label)), false);
});

test("CRB values cannot affect the score, including adverse or clean claims", () => {
  const noReport = computeCreditScore(BASE);
  assert.equal(computeCreditScore({ ...BASE, crbStatus: "clean" }).score, noReport.score);
  assert.equal(computeCreditScore({ ...BASE, crbStatus: "adverse" }).score, noReport.score);
});

test("new KYC-verified borrower with no financial evidence is provisional and never credited with repayment history", () => {
  const score = computeCreditScore({ momoMonths: 0, momoTxnCount: 0, momoVerified: false, kycVerified: true, loansRepaid: 0, loansTotal: 0 });
  assert.equal(score.score, 410);
  assert.equal(score.tier, "Building");
  assert.equal(score.provisional, true);
  assert.equal(score.factors.find(f => f.key === "repayment")?.contribution, 0);
  assert.equal(score.factors.find(f => f.key === "momo")?.contribution, 0);
});

test("unverified mobile money counts never award points even if values are supplied", () => {
  const unverified = computeCreditScore({ ...BASE, momoVerified: false });
  assert.equal(unverified.factors.find(f => f.key === "momo")?.contribution, 0);
  assert.ok(computeCreditScore(BASE).score > unverified.score);
});

test("verified evidence and on-time repayments improve the evidence score", () => {
  const thin = computeCreditScore({ ...BASE, momoMonths: 1, momoTxnCount: 5, loansRepaid: 0, loansTotal: 1 });
  const strong = computeCreditScore({ ...BASE, momoMonths: 12, momoTxnCount: 150, loansRepaid: 4, loansTotal: 4 });
  assert.ok(strong.score > thin.score);
  assert.equal(strong.score, 850);
});
