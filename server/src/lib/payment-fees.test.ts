import test from "node:test";
import assert from "node:assert/strict";
import { collectionQuote, payoutFee, payoutQuote, acceptedPaymentFees } from "./payment-fees.js";
import { linesFor } from "./ledger.js";

test("gross-up recovers 3% of the entire collection without underpaying the loan", () => {
  assert.deepEqual([collectionQuote(50000).totalDebit, collectionQuote(50000).customerFee], [51547, 1547]);
  for (const credit of [486, 500, 1000, 10000, 50000, 20000, 9700000]) {
    const quote = collectionQuote(credit);
    assert.equal(quote.totalDebit - Math.ceil(quote.totalDebit * 3 / 100), credit);
    assert.equal(quote.totalDebit - quote.customerFee, credit);
  }
  assert.equal(collectionQuote(10000, false).customerFee, 0);
  for (const invalid of [0, -1, NaN, Infinity, 1.5, 10_000_000]) assert.throws(() => collectionQuote(invalid));
});
test("payout fee is flat and based on the actual net send amount", () => {
  assert.deepEqual(payoutQuote(50000), { budget: 50000, net: 49000, customerFee: 1000 });
  for (const [amount, fee] of [[500,1000], [50000,1000], [50001,1500], [300000,1500], [300001,2800], [750000,2800], [750001,5000], [5000000,5000]]) assert.equal(payoutFee(amount), fee);
  assert.throws(() => payoutFee(5000001));
  assert.throws(() => payoutQuote(51200), /revised offer/);
  assert.equal(acceptedPaymentFees({ principal: 50000 }), null, "old agreement is not repriced");
});
function assertBalanced(lines: ReturnType<typeof linesFor>) {
  const sum = (direction: string) => lines.filter(line => line.direction === direction).reduce((n,line) => n + line.amount, 0n);
  assert.equal(sum("debit"), sum("credit"));
}
test("payout principal includes its accepted cost; fee savings belong to the customer", () => {
  for (const actual of [0n, 900n, 1000n, 1500n]) {
    const lines = linesFor({ type: "loan_disbursement_leg", amount: 49000n, customerFee: 1000n, providerFee: actual });
    assertBalanced(lines);
    assert.equal(lines.find(line => line.accountCode === "LOAN_PRINCIPAL_RECEIVABLE")?.amount, 50000n);
    assert.equal(lines.find(line => line.accountCode === "MOBILE_MONEY_CLEARING")?.amount, 49000n + actual);
    const held = lines.find(line => line.accountCode === "UNAPPLIED_CUSTOMER_FUNDS")?.amount ?? 0n;
    assert.equal(held, actual < 1000n ? 1000n - actual : 0n);
  }
});
test("a collection applies loan credit only, posts cost recovery separately and holds savings", () => {
  for (const actual of [300n,310n,350n]) {
    const recovered = actual < 310n ? actual : 310n;
    const lines = linesFor({ type: "loan_payment", amount: 10310n, customerFee: 310n, providerFee: actual,
      allocation: { interest: 1000n, principal: 9000n, unapplied: 310n - recovered } });
    assertBalanced(lines);
    assert.equal(lines.find(line => line.accountCode === "LOAN_PRINCIPAL_RECEIVABLE")?.amount, 9000n);
  }
});
