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

test("a collection credits the borrower in full and books the charge separately", () => {
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
