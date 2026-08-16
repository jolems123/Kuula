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
