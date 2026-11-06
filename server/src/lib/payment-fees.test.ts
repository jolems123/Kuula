import test from "node:test";
import assert from "node:assert/strict";
import { collectionQuote, payoutFee, payoutQuote, acceptedPaymentFees } from "./payment-fees.js";
import { linesFor } from "./ledger.js";

test("repayment adds exactly 3% of the requested loan payment", () => {
  assert.deepEqual([collectionQuote(50000).totalDebit, collectionQuote(50000).customerFee], [51500, 1500]);
  for (const credit of [486, 500, 1000, 10000, 50000, 20000, 9700000]) {
    const quote = collectionQuote(credit);
    assert.equal(quote.customerFee, Math.ceil(credit * 3 / 100));
    assert.equal(quote.totalDebit - quote.customerFee, credit);
  }
  assert.equal(collectionQuote(10000, false).customerFee, 0);
  for (const invalid of [0, -1, NaN, Infinity, 1.5, 10_000_000]) assert.throws(() => collectionQuote(invalid));
});
test("customer payout fee is 3% while provider funding uses the separate flat tariff", () => {
  assert.deepEqual(payoutQuote(50000), { budget: 50000, net: 48500, customerFee: 1500 });
  for (const [amount, fee] of [[500,1000], [50000,1000], [50001,1500], [300000,1500], [300001,2800], [750000,2800], [750001,5000], [5000000,5000]]) assert.equal(payoutFee(amount), fee);
  assert.throws(() => payoutFee(5000001));
  assert.deepEqual(payoutQuote(51200), { budget: 51200, net: 49664, customerFee: 1536 });
  assert.equal(acceptedPaymentFees({ principal: 50000 }), null, "old agreement is not repriced");
});
function assertBalanced(lines: ReturnType<typeof linesFor>) {
  const sum = (direction: string) => lines.filter(line => line.direction === direction).reduce((n,line) => n + line.amount, 0n);
  assert.equal(sum("debit"), sum("credit"));
}
test("fixed disbursement fee is income separate from actual provider expense", () => {
  for (const actual of [0n, 1000n, 1500n, 2000n]) {
    const lines = linesFor({ type: "loan_disbursement_leg", amount: 48500n, customerFee: 1500n, providerFee: actual });
    assertBalanced(lines);
    assert.equal(lines.find(line => line.accountCode === "LOAN_PRINCIPAL_RECEIVABLE")?.amount, 50000n);
    assert.equal(lines.find(line => line.accountCode === "MOBILE_MONEY_CLEARING")?.amount, 48500n + actual);
    assert.equal(lines.find(line => line.accountCode === "PAYMENT_FEE_INCOME")?.amount, 1500n);
    assert.equal(lines.some(line => line.accountCode === "UNAPPLIED_CUSTOMER_FUNDS"), false);
  }
});
test("a collection credits only the requested loan payment regardless of provider cost", () => {
  for (const actual of [290n,300n,309n,350n]) {
    const lines = linesFor({ type: "loan_payment", amount: 10300n, customerFee: 300n, providerFee: actual,
      allocation: { interest: 1000n, principal: 9000n, unapplied: 0n } });
    assertBalanced(lines);
    assert.equal(lines.find(line => line.accountCode === "LOAN_PRINCIPAL_RECEIVABLE")?.amount, 9000n);
    assert.equal(lines.find(line => line.accountCode === "PAYMENT_FEE_INCOME")?.amount, 300n);
  }
});
