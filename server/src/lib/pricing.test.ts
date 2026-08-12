import test from "node:test";
import assert from "node:assert/strict";
import { localQuote, PRICING } from "./pricing.js";

test("uses simple daily interest", () => {
  const quote = localQuote(100_000, 90);
  const expectedInterest = Math.round(100_000 * (PRICING.MAX_APR / 365) * 90);

  assert.equal(quote.interest, expectedInterest);
  assert.equal(quote.total, 100_000 + expectedInterest);
  assert.equal(quote.compound, false);
  assert.equal(quote.fee, 0);
});

test("returns the complete customer quote shape", () => {
  const quote = localQuote(250_000, 120);

  assert.deepEqual(Object.keys(quote).sort(), [
    "apr",
    "aprPercent",
    "compound",
    "fee",
    "interest",
    "monthlyRatePercent",
    "principal",
    "termDays",
    "total",
  ].sort());
});

test("clamps loan terms to the supported range", () => {
  assert.equal(localQuote(100_000, 30).termDays, PRICING.MIN_TERM_DAYS);
  assert.equal(localQuote(100_000, 720).termDays, PRICING.MAX_TERM_DAYS);
  assert.equal(localQuote(100_000, Number.NaN).termDays, PRICING.MIN_TERM_DAYS);
});

test("rounds Uganda-shilling principal amounts", () => {
  assert.equal(localQuote(100_000.6, 90).principal, 100_001);
});

test("rejects non-positive and non-finite principals", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => localQuote(value, 90), RangeError);
  }
});
