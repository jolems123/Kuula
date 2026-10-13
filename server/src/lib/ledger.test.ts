import test from "node:test";
import assert from "node:assert/strict";
import { linesFor } from "./ledger.js";

function balance(lines: ReturnType<typeof linesFor>) {
  const debit = lines.filter((line) => line.direction === "debit").reduce((sum, line) => sum + line.amount, BigInt(0));
  const credit = lines.filter((line) => line.direction === "credit").reduce((sum, line) => sum + line.amount, BigInt(0));
  return { debit, credit };
}

test("a payout charge is an expense, not borrower principal", () => {
  const lines = linesFor({ type: "loan_disbursement_leg", amount: BigInt(100000), providerFee: BigInt(500) });
  assert.deepEqual(lines.map((line) => [line.accountCode, line.direction, line.amount]), [
    ["LOAN_PRINCIPAL_RECEIVABLE", "debit", BigInt(100000)],
    ["PROVIDER_FEE_EXPENSE", "debit", BigInt(500)],
    ["MOBILE_MONEY_CLEARING", "credit", BigInt(100500)],
  ]);
  const { debit, credit } = balance(lines);
  assert.equal(debit, credit);
});

test("an unmatched collection waits in suspense, with the charge booked separately", () => {
  const lines = linesFor({ type: "loan_payment", amount: BigInt(10000), providerFee: BigInt(350) });
  assert.deepEqual(lines.map((line) => [line.accountCode, line.direction, line.amount]), [
    ["MOBILE_MONEY_CLEARING", "debit", BigInt(9650)],
    ["PROVIDER_FEE_EXPENSE", "debit", BigInt(350)],
    ["LOAN_COLLECTIONS_SUSPENSE", "credit", BigInt(10000)],
  ]);
  const { debit, credit } = balance(lines);
  assert.equal(debit, credit);
});

test("without a known charge the journal is a plain two-line entry", () => {
  assert.equal(linesFor({ type: "loan_payment", amount: BigInt(10000) }).length, 2);
  assert.throws(() => linesFor({ type: "loan_payment", amount: BigInt(300), providerFee: BigInt(300) }));
});

test("repayments settle interest first, then principal, and hold any excess", async () => {
  const { allocateRepayment } = await import("./ledger.js");
  // Loan: 100,000 principal + 8,285 interest.
  const loan = { loanInterest: 8_285, loanTotal: 108_285 };
  assert.deepEqual(allocateRepayment({ ...loan, payment: 10_000, paidBefore: 0 }), { interest: BigInt(8_285), principal: BigInt(1_715), unapplied: BigInt(0) });
  assert.deepEqual(allocateRepayment({ ...loan, payment: 20_000, paidBefore: 10_000 }), { interest: BigInt(0), principal: BigInt(20_000), unapplied: BigInt(0) });
  assert.deepEqual(allocateRepayment({ ...loan, payment: 5_000, paidBefore: 3_000 }), { interest: BigInt(5_000), principal: BigInt(0), unapplied: BigInt(0) });
  assert.deepEqual(allocateRepayment({ ...loan, payment: 80_000, paidBefore: 30_000 }), { interest: BigInt(0), principal: BigInt(78_285), unapplied: BigInt(1_715) });
});

test("an allocated collection reduces the receivable and recognises interest income", () => {
  const lines = linesFor({ type: "loan_payment", amount: BigInt(10_000), providerFee: BigInt(350), allocation: { interest: BigInt(8_285), principal: BigInt(1_715), unapplied: BigInt(0) } });
  assert.deepEqual(lines.map((line) => [line.accountCode, line.direction, line.amount]), [
    ["MOBILE_MONEY_CLEARING", "debit", BigInt(9_650)],
    ["PROVIDER_FEE_EXPENSE", "debit", BigInt(350)],
    ["LOAN_PRINCIPAL_RECEIVABLE", "credit", BigInt(1_715)],
    ["INTEREST_INCOME", "credit", BigInt(8_285)],
  ]);
  const { debit, credit } = balance(lines);
  assert.equal(debit, credit);
  assert.throws(() => linesFor({ type: "loan_payment", amount: BigInt(10_000), allocation: { interest: BigInt(1), principal: BigInt(1), unapplied: BigInt(1) } }), /allocation/);
});
