/**
 * Client-side loan pricing — mirrors server/core.mjs so every build (even
 * offline/demo) shows a compliant, APR-capped, simple-interest quote and never
 * the old 8%/month figure.
 *
 *  - All-in APR is capped at 33.6% (below Apple's 36% loan-app limit).
 *  - Minimum term 90 days keeps loans above Google Play's 60-day floor.
 *  - Interest is simple: cost = principal × (apr/365) × days.
 */
import type { LoanQuote } from "../api/client";

export const PRICING = {
  MAX_APR: 0.336,
  MIN_TERM_DAYS: 90,
  SAVINGS_DISCOUNT: 0.05,
  SAVINGS_THRESHOLD: 100000,
};

export function localQuote(principal: number, termDays: number, savingsBalance = 0): LoanQuote {
  const term = Math.max(PRICING.MIN_TERM_DAYS, Math.round(termDays || PRICING.MIN_TERM_DAYS));
  const discount = savingsBalance >= PRICING.SAVINGS_THRESHOLD ? PRICING.SAVINGS_DISCOUNT : 0;
  const apr = Math.max(0, PRICING.MAX_APR - discount);
  const interest = Math.round(principal * (apr / 365) * term);
  return {
    principal,
    termDays: term,
    apr: Number(apr.toFixed(4)),
    aprPercent: Number((apr * 100).toFixed(1)),
    monthlyRatePercent: Number(((apr / 12) * 100).toFixed(2)),
    interest,
    fee: 0,
    total: principal + interest,
    savingsDiscountApplied: discount > 0,
    compound: false,
  };
}
