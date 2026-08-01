/**
 * Authoritative server-side loan pricing.
 *
 * This must remain exactly aligned with src/app/lib/pricing.ts. CI executes a
 * parity check across representative amount, term, and balance combinations.
 *
 * Interest is simple:
 *   interest = principal × APR × termDays / 365
 */
import { COMPLIANCE } from "./compliance.js";

export const PRICING = {
  MAX_APR: COMPLIANCE.maxAprPercent / 100,
  MIN_TERM_DAYS: COMPLIANCE.minTermDays,
  MAX_TERM_DAYS: 365,
  // Savings is not a pricing input until real deposits are provider-settled.
  SAVINGS_DISCOUNT: 0,
  SAVINGS_THRESHOLD: Number.POSITIVE_INFINITY,
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
  _savingsBalance = 0
): LoanQuote {
  const principal = normalizePrincipal(principalInput);
  const termDays = normalizeTerm(termDaysInput);
  const apr = PRICING.MAX_APR;
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
    savingsDiscountApplied: false,
    compound: false,
  };
}
