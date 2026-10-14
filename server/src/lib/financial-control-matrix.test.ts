import test from "node:test";
import assert from "node:assert/strict";
import { allocateRepayment, linesFor } from "./ledger.js";

// Reference values were calculated independently of Kuula's implementation.
// Loan principal UGX 100,000, contractual interest UGX 8,285,
// confirmed payout provider fee UGX 500, collection fee UGX 350.
const journal = (type: string, amount: bigint, options: Record<string, unknown> = {}) =>
  linesFor({ type, amount, ...options } as Parameters<typeof linesFor>[0]);
const net = (lines: ReturnType<typeof linesFor>, account: string) =>
  lines.filter(x => x.accountCode === account).reduce((total, x) => total + (x.direction === "debit" ? x.amount : -x.amount), 0n);
const balanced = (lines: ReturnType<typeof linesFor>) =>
  lines.reduce((total, x) => total + (x.direction === "debit" ? x.amount : -x.amount), 0n) === 0n;

test("independent settlement control: payout debits borrower 100,000 and charges provider expense 500", () => {
  const lines = journal("loan_disbursement_leg", 100000n, { providerFee: 500n });
  assert.equal(net(lines, "LOAN_PRINCIPAL_RECEIVABLE"), 100000n);
  assert.equal(net(lines, "PROVIDER_FEE_EXPENSE"), 500n);
  assert.equal(net(lines, "MOBILE_MONEY_CLEARING"), -100500n);
  assert.ok(balanced(lines));
});

test("independent settlement control: partial payment allocates interest before principal, not fee", () => {
  const allocation = allocateRepayment({ payment: 10000, loanInterest: 8285, loanTotal: 108285, paidBefore: 0 });
  assert.deepEqual(allocation, { interest: 8285n, principal: 1715n, unapplied: 0n });
  const lines = journal("loan_payment", 10000n, { providerFee: 350n, allocation });
  assert.equal(net(lines, "MOBILE_MONEY_CLEARING"), 9650n);
  assert.equal(net(lines, "PROVIDER_FEE_EXPENSE"), 350n);
  assert.equal(net(lines, "INTEREST_INCOME"), -8285n);
  assert.equal(net(lines, "LOAN_PRINCIPAL_RECEIVABLE"), -1715n);
  assert.ok(balanced(lines));
});

test("independent settlement control: loan closure and overpayment held for customer", () => {
  const allocation = allocateRepayment({ payment: 100000, loanInterest: 8285, loanTotal: 108285, paidBefore: 10000 });
  assert.deepEqual(allocation, { interest: 0n, principal: 98285n, unapplied: 1715n });
  const lines = journal("loan_payment", 100000n, { providerFee: 350n, allocation });
  assert.equal(net(lines, "LOAN_PRINCIPAL_RECEIVABLE"), -98285n);
  assert.equal(net(lines, "UNAPPLIED_CUSTOMER_FUNDS"), -1715n);
  assert.equal(net(lines, "MOBILE_MONEY_CLEARING"), 99650n);
  assert.ok(balanced(lines));
  const refund = journal("customer_refund", 1715n, { providerFee: 100n, refundSourceAccount: "UNAPPLIED_CUSTOMER_FUNDS" });
  assert.equal(net(refund, "UNAPPLIED_CUSTOMER_FUNDS"), 1715n);
  assert.equal(net(refund, "MOBILE_MONEY_CLEARING"), -1815n);
  assert.equal(net(refund, "PROVIDER_FEE_EXPENSE"), 100n);
  assert.ok(balanced(refund));
  assert.equal(net([...lines, ...refund], "UNAPPLIED_CUSTOMER_FUNDS"), 0n);
});

test("unidentified settled collection remains a liability until resolved", () => {
  const lines = journal("loan_payment", 10000n, { providerFee: 350n });
  assert.equal(net(lines, "LOAN_COLLECTIONS_SUSPENSE"), -10000n);
  assert.equal(net(lines, "MOBILE_MONEY_CLEARING"), 9650n);
  assert.ok(balanced(lines));
});

test("allocation rejects inaccurate division of collected funds", () => {
  assert.throws(() => journal("loan_payment", 10000n, {
    allocation: { interest: 5000n, principal: 4000n, unapplied: 0n },
  }), /allocation/i);
});
