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

test("a confirmed refund releases the held money and books MarzPay's charge as Kuula's cost", () => {
  const lines = linesFor({ type: "customer_refund", amount: BigInt(5_000), providerFee: BigInt(500), refundSourceAccount: "UNAPPLIED_CUSTOMER_FUNDS" });
  assert.deepEqual(lines.map((line) => [line.accountCode, line.direction, line.amount]), [
    ["UNAPPLIED_CUSTOMER_FUNDS", "debit", BigInt(5_000)],
    ["PROVIDER_FEE_EXPENSE", "debit", BigInt(500)],
    ["MOBILE_MONEY_CLEARING", "credit", BigInt(5_500)],
  ]);
  assert.throws(() => linesFor({ type: "customer_refund", amount: BigInt(5_000) }), /held/);
});


test("accepted loan fees never reduce principal and remain separate from payment fees", async () => {
  const { allocateRepayment } = await import("./ledger.js");
  const loan = { loanInterest: 1000, loanFees: 100, loanTotal: 11100 };
  assert.deepEqual(allocateRepayment({ ...loan, payment: 1050, paidBefore: 0 }), { interest: 1000n, fees: 50n, principal: 0n, unapplied: 0n });
  assert.deepEqual(allocateRepayment({ ...loan, payment: 100, paidBefore: 1050 }), { interest: 0n, fees: 50n, principal: 50n, unapplied: 0n });
  const allocation = allocateRepayment({ ...loan, payment: 12000, paidBefore: 0 });
  assert.deepEqual(allocation, { interest: 1000n, fees: 100n, principal: 10000n, unapplied: 900n });
  const lines = linesFor({ type: "loan_payment", amount: 12360n, customerFee: 360n, providerFee: 371n, allocation });
  assert.equal(balance(lines).debit, balance(lines).credit);
  assert.equal(lines.find((line) => line.accountCode === "LOAN_FEE_INCOME")?.amount, 100n);
  assert.equal(lines.find((line) => line.accountCode === "PAYMENT_FEE_INCOME")?.amount, 360n);
  const first = allocateRepayment({ ...loan, payment: 1050, paidBefore: 0 });
  const last = allocateRepayment({ ...loan, payment: 10050, paidBefore: 1050 });
  assert.equal(first.principal + last.principal, 10000n);
  assert.deepEqual(allocateRepayment({ ...loan, payment: 500, paidBefore: 11100 }), { interest: 0n, principal: 0n, unapplied: 500n });
});
