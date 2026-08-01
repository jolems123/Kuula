import { describe, it, expect } from "vitest";
import { localQuote, PRICING } from "./pricing";

describe("localQuote — loan pricing", () => {
  it("enforces the supported term range", () => {
    expect(localQuote(100000, 30).termDays).toBe(PRICING.MIN_TERM_DAYS);
    expect(localQuote(100000, 720).termDays).toBe(PRICING.MAX_TERM_DAYS);
    expect(localQuote(100000, Number.NaN).termDays).toBe(PRICING.MIN_TERM_DAYS);
  });

  it("keeps the all-in APR at or below the configured caps", () => {
    const quote = localQuote(500000, 180);
    expect(quote.apr).toBeLessThanOrEqual(PRICING.MAX_APR);
    expect(quote.apr).toBeLessThanOrEqual(0.36);
  });

  it("computes simple interest: principal × (apr/365) × days", () => {
    const principal = 100000;
    const term = 90;
    const quote = localQuote(principal, term);
    const expectedInterest = Math.round(principal * (PRICING.MAX_APR / 365) * term);
    expect(quote.interest).toBe(expectedInterest);
    expect(quote.total).toBe(principal + expectedInterest);
    expect(quote.compound).toBe(false);
    expect(quote.fee).toBe(0);
  });

  it("does not let an unverified legacy savings balance change pricing", () => {
    const noBalance = localQuote(100000, 90, 0);
    const legacyBalance = localQuote(100000, 90, 10_000_000);

    expect(legacyBalance).toEqual(noBalance);
    expect(legacyBalance.savingsDiscountApplied).toBe(false);
    expect(PRICING.SAVINGS_DISCOUNT).toBe(0);
  });

  it("rounds principal to whole Uganda shillings", () => {
    expect(localQuote(100000.6, 90).principal).toBe(100001);
  });

  it("rejects invalid principal amounts", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => localQuote(value, 90)).toThrow(RangeError);
    }
  });
});
