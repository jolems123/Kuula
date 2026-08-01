/**
 * Authoritative server-side loan pricing.
 *
 * This must remain exactly aligned with src/app/lib/pricing.ts. CI executes a
 * parity check across representative amount, term, and savings combinations.
 *
 * Interest is simple:
 *   interest = principal × APR × termDays / 365
 */
import { COMPLIANCE } from "./compliance.js";

export const PRICING = {
  MAX_APR: COMPLIANCE.maxAprPercent / 100,
  MIN_TERM_DAYS: COMPLIANCE.minTermDays,
  MAX_TERM_DAYS: 365,
  SAVINGS_DISCOUNT: COMPLIANCE.savingsDiscountPercent / 100,
  SAVINGS_THRESHOLD: COMPLIANCE.savingsThreshold,
} as const;

export interface LoanQuote {
  principal: number;
  termDays: number;
  apr: number;
  aprPercent: number;
  monthlyRatePercent: number;
  interest: number;
  fee: number;
  total: number;
  savingsDiscountApplied: boolean;
  compound: false;
}

function normalizePrincipal(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Loan amount must be a positive number");
  }
  return Math.round(value);
}

function normalizeTerm(value: number): number {
  const requested = Number.isFinite(value) && value > 0
    ? Math.round(value)
    : PRICING.MIN_TERM_DAYS;
  return Math.min(PRICING.MAX_TERM_DAYS, Math.max(PRICING.MIN_TERM_DAYS, requested));
}

export function localQuote(
  principalInput: number,
  termDaysInput: number,
  savingsBalance = 0
): LoanQuote {
  const principal = normalizePrincipal(principalInput);
  const termDays = normalizeTerm(termDaysInput);
  const savingsDiscountApplied = Number(savingsBalance) >= PRICING.SAVINGS_THRESHOLD;
  const discount = savingsDiscountApplied ? PRICING.SAVINGS_DISCOUNT : 0;
  const apr = Math.max(0, PRICING.MAX_APR - discount);
  const interest = Math.round(principal * (apr / 365) * termDays);

  return {
    principal,
    termDays,
    apr: Number(apr.toFixed(4)),
    aprPercent: Number((apr * 100).toFixed(1)),
    monthlyRatePercent: Number(((apr / 12) * 100).toFixed(2)),
    interest,
    fee: 0,
    total: principal + interest,
    savingsDiscountApplied,
    compound: false,
  };
}
