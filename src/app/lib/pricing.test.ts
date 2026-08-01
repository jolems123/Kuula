import { describe, it, expect } from "vitest";
import { localQuote, PRICING } from "./pricing";

describe("localQuote — loan pricing", () => {
  it("enforces the supported term range", () => {
    expect(localQuote(100000, 30).termDays).toBe(PRICING.MIN_TERM_DAYS);
    expect(localQuote(100000, 720).termDays).toBe(PRICING.MAX_TERM_DAYS);
    expect(localQuote(100000, Number.NaN).termDays).toBe(PRICING.MIN_TERM_DAYS);
  });

  it("keeps the all-in APR at or below the configured caps", () => {
    const q = localQuote(500000, 180);
    expect(q.apr).toBeLessThanOrEqual(PRICING.MAX_APR);
    expect(q.apr).toBeLessThanOrEqual(0.36);
  });

  it("computes simple interest: principal × (apr/365) × days", () => {
    const principal = 100000;
    const term = 90;
    const q = localQuote(principal, term);
    const expectedInterest = Math.round(principal * (PRICING.MAX_APR / 365) * term);
    expect(q.interest).toBe(expectedInterest);
    expect(q.total).toBe(principal + expectedInterest);
    expect(q.compound).toBe(false);
    expect(q.fee).toBe(0);
  });

  it("applies a five percentage-point savings discount at the threshold", () => {
    const below = localQuote(100000, 90, PRICING.SAVINGS_THRESHOLD - 1);
    const atOrAbove = localQuote(100000, 90, PRICING.SAVINGS_THRESHOLD);
    expect(below.savingsDiscountApplied).toBe(false);
    expect(atOrAbove.savingsDiscountApplied).toBe(true);
    expect(atOrAbove.apr).toBeCloseTo(PRICING.MAX_APR - PRICING.SAVINGS_DISCOUNT, 5);
    expect(atOrAbove.interest).toBeLessThan(below.interest);
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
