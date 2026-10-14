import test from "node:test";
import assert from "node:assert/strict";
import { evaluateUnderwriting, UNDERWRITING_POLICY } from "./underwriting.js";

const evidence = {
  momoMonths: 24,
  momoTxnCount: 300,
  crbStatus: "clean",
  momoVerified: true,
  crbVerified: true,
  evidenceIds: ["momo", "crb"],
};

test("unverified declared income is haircutted for affordability", () => {
  const result = evaluateUnderwriting({
    requestedAmount: 100_000,
    totalRepayment: 108_000,
    termDays: 90,
    declaredMonthlyIncome: 1_000_000,
    declaredMonthlyExpenses: 100_000,
    existingDebtPayment: 0,
    verifiedMonthlyIncome: null,
    phoneVerified: true,
    kycVerified: true,
    evidence,
    loansRepaid: 3,
    loansTotal: 3,
  });
  assert.equal(UNDERWRITING_POLICY.unverifiedIncomeHaircut, 0.6);
  assert.equal(result.disposableIncome, 500_000);
  assert.equal(result.maxAffordablePayment, 630_000);
  assert.equal(result.approved, true);
});

test("verified income uses the lower of declared and verified values", () => {
  const result = evaluateUnderwriting({
    requestedAmount: 100_000,
    totalRepayment: 108_000,
    termDays: 90,
    declaredMonthlyIncome: 1_000_000,
    declaredMonthlyExpenses: 100_000,
    existingDebtPayment: 0,
    verifiedMonthlyIncome: 400_000,
    phoneVerified: true,
    kycVerified: true,
    evidence,
    loansRepaid: 3,
    loansTotal: 3,
  });
  assert.equal(result.disposableIncome, 300_000);
  assert.equal(result.maxAffordablePayment, 420_000);
});

const base = {
  requestedAmount: 100_000,
  totalRepayment: 108_000,
  termDays: 90,
  existingDebtPayment: 0,
  verifiedMonthlyIncome: null,
  phoneVerified: true,
  kycVerified: true,
  evidence,
  loansRepaid: 3,
  loansTotal: 3,
};

test("a low-margin business is limited by its net cash flow, not its gross sales", () => {
  // Sales 1,000,000 (600,000 after the haircut), business costs 500,000: net cash flow
  // is 100,000 a month, so at most 50,000 a month can go to repayments.
  const result = evaluateUnderwriting({ ...base, declaredMonthlyIncome: 1_000_000, declaredMonthlyExpenses: 500_000, totalRepayment: 200_000, requestedAmount: 185_000 });
  assert.equal(UNDERWRITING_POLICY.maxNetCashFlowShare, 0.5);
  assert.equal(result.maxAffordablePayment, 150_000);
  assert.ok(result.flags.includes("repayment_not_affordable"));
});

test("a first-time borrower is capped until they have repaid loans", () => {
  const firstTimer = evaluateUnderwriting({ ...base, declaredMonthlyIncome: 10_000_000, declaredMonthlyExpenses: 1_000_000, requestedAmount: 1_000_000, totalRepayment: 1_080_000, loansRepaid: 0, loansTotal: 0 });
  assert.equal(firstTimer.approvedLimit, UNDERWRITING_POLICY.firstLoanCapUgx);
  assert.ok(firstTimer.flags.includes("requested_amount_above_limit"));
  const proven = evaluateUnderwriting({ ...base, declaredMonthlyIncome: 10_000_000, declaredMonthlyExpenses: 1_000_000, requestedAmount: 1_000_000, totalRepayment: 1_080_000, loansRepaid: 1, loansTotal: 1 });
  assert.ok(proven.approvedLimit >= 1_000_000);
});

test("CRB is neither scored nor a condition for a reviewed business loan", () => {
  const withoutCrb = {
    ...base,
    evidence: { ...evidence, crbVerified: false, crbStatus: "not_used" },
    declaredMonthlyIncome: 1_000_000,
    declaredMonthlyExpenses: 100_000,
  };
  const checked = evaluateUnderwriting(withoutCrb);
  const oldCrbRecord = evaluateUnderwriting({ ...withoutCrb, evidence: { ...withoutCrb.evidence, crbVerified: true, crbStatus: "clean" } });
  assert.equal(checked.creditScore, oldCrbRecord.creditScore);
  assert.equal(checked.approved, true);
  assert.ok(!checked.flags.some(flag => /crb/i.test(flag)));
});

test("new borrowers without CRB or MoMo evidence can be considered conservatively based on KYC and cash flow", () => {
  const result = evaluateUnderwriting({
    ...base,
    evidence: { ...evidence, momoMonths: 0, momoTxnCount: 0, momoVerified: false, crbStatus: "not_used", crbVerified: false },
    loansRepaid: 0,
    loansTotal: 0,
    requestedAmount: 100_000,
    totalRepayment: 108_000,
    declaredMonthlyIncome: 1_000_000,
    declaredMonthlyExpenses: 100_000,
  });
  assert.equal(result.creditScore, 410);
  assert.equal(result.approvedLimit, 100_000);
  assert.equal(result.approved, true);
  assert.ok(!result.flags.some(flag => /crb|mobile_money_evidence_missing/.test(flag)));
});
