/**
 * Authoritative server-side loan pricing.
 * This must remain exactly aligned with src/app/lib/pricing.ts.
 *
 * Interest is simple:
 *   interest = principal × APR × termDays / 365
 */
import { COMPLIANCE } from "./compliance.js";

export const PRICING = {
  MAX_APR: COMPLIANCE.maxAprPercent / 100,
  MIN_TERM_DAYS: COMPLIANCE.minTermDays,
  MAX_TERM_DAYS: 365,
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
  compound: false;
}

function normalizePrincipal(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Loan amount must be a positive number");
  return Math.round(value);
}

function normalizeTerm(value: number): number {
  const requested = Number.isFinite(value) && value > 0 ? Math.round(value) : PRICING.MIN_TERM_DAYS;
  return Math.min(PRICING.MAX_TERM_DAYS, Math.max(PRICING.MIN_TERM_DAYS, requested));
}

export function localQuote(principalInput: number, termDaysInput: number, ..._ignoredLegacyArgs: unknown[]): LoanQuote {
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
    compound: false,
  };
}
