import { describe, it, expect } from "vitest";
import { localQuote, PRICING } from "./pricing";

describe("localQuote — loan pricing", () => {
  it("enforces the minimum term (Google Play ≥60-day floor)", () => {
    const q = localQuote(100000, 30);
    expect(q.termDays).toBe(PRICING.MIN_TERM_DAYS);
  });

  it("keeps the all-in APR at or below the 36% loan-app cap", () => {
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
  });

  it("applies the savings discount only above the threshold", () => {
    const below = localQuote(100000, 90, PRICING.SAVINGS_THRESHOLD - 1);
    const atOrAbove = localQuote(100000, 90, PRICING.SAVINGS_THRESHOLD);
    expect(below.savingsDiscountApplied).toBe(false);
    expect(atOrAbove.savingsDiscountApplied).toBe(true);
    expect(atOrAbove.apr).toBeCloseTo(PRICING.MAX_APR - PRICING.SAVINGS_DISCOUNT, 5);
    expect(atOrAbove.interest).toBeLessThan(below.interest);
  });

  it("never produces a negative APR", () => {
    const q = localQuote(100000, 90, 10_000_000);
    expect(q.apr).toBeGreaterThanOrEqual(0);
  });

  it("rounds a missing/invalid term up to the minimum", () => {
    const q = localQuote(100000, 0);
    expect(q.termDays).toBe(PRICING.MIN_TERM_DAYS);
  });
});
