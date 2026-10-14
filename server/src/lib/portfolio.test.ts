import test from "node:test";
import assert from "node:assert/strict";
import { daysPastDue, summarizePortfolio, type BookedLoan } from "./portfolio.js";

const now = new Date("2026-10-14T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
function loan(id: string, overrides: Partial<BookedLoan>): BookedLoan {
  return { applicationId: id, principal: 100_000, interest: 8_000, total: 108_000, amountPaid: 0, disbursedAt: daysAgo(120), dueDate: daysAgo(30), sector: "Retail", ...overrides };
}

test("days past due count from the due date and stop once the loan is repaid", () => {
  assert.equal(daysPastDue(loan("a", { dueDate: daysAgo(10) }), now), 10);
  assert.equal(daysPastDue(loan("b", { dueDate: daysAgo(-5) }), now), 0);
  assert.equal(daysPastDue(loan("c", { dueDate: daysAgo(10), amountPaid: 108_000 }), now), 0);
});

test("PAR buckets measure late outstanding balances against the whole outstanding book", () => {
  const book = [
    loan("current", { dueDate: daysAgo(-20) }),               // 108,000 outstanding, not due
    loan("late8", { dueDate: daysAgo(8), amountPaid: 8_000 }), // 100,000 outstanding, 8 days late
    loan("late95", { dueDate: daysAgo(95) }),                  // 108,000 outstanding, 95 days late
    loan("repaid", { dueDate: daysAgo(200), amountPaid: 108_000 }),
  ];
  const summary = summarizePortfolio(book, now);
  assert.equal(summary.outstanding, 316_000);
  assert.equal(summary.overdueLoans, 2);
  const par = Object.fromEntries(summary.par.map((bucket) => [bucket.days, bucket]));
  assert.equal(par[1].outstanding, 208_000);
  assert.equal(par[7].outstanding, 208_000);
  assert.equal(par[30].outstanding, 108_000);
  assert.equal(par[90].outstanding, 108_000);
  assert.equal(par[30].pct, 34.2);
  assert.equal(summary.defaultRatePct, 25);
  assert.equal(summary.repaymentRatePct, 25);
});

test("vintages group loans by disbursement month", () => {
  const summary = summarizePortfolio([
    loan("a", { disbursedAt: new Date("2026-07-03T00:00:00Z"), amountPaid: 108_000 }),
    loan("b", { disbursedAt: new Date("2026-07-20T00:00:00Z"), dueDate: daysAgo(40) }),
    loan("c", { disbursedAt: new Date("2026-08-02T00:00:00Z"), dueDate: daysAgo(-10) }),
  ], now);
  assert.deepEqual(summary.vintages.map((row) => [row.vintage, row.loans, row.repaidPct, row.par30Pct]), [
    ["2026-07", 2, 50, 100],
    ["2026-08", 1, 0, 0],
  ]);
});

test("inflow forecast buckets open balances by due week and sets late loans apart", async () => {
  const { forecastInflows } = await import("./portfolio.js");
  const result = forecastInflows([
    loan("due-this-week", { dueDate: daysAgo(-3) }),
    loan("due-in-two-weeks", { dueDate: daysAgo(-15), amountPaid: 8_000 }),
    loan("late", { dueDate: daysAgo(10) }),
    loan("very-late", { dueDate: daysAgo(120) }),
    loan("repaid", { dueDate: daysAgo(-3), amountPaid: 108_000 }),
  ], now, 4);
  assert.deepEqual(result.weekly.map((week) => week.expected), [108_000, 0, 100_000, 0]);
  assert.equal(result.overdueCollectible, 108_000);
  assert.equal(result.excludedOver90, 108_000);
});
