/**
 * Server-side loan pricing — mirrors src/app/lib/pricing.ts.
 */
const COMPLIANCE = {
  maxAprPercent: 33.6,
  appleAprCapPercent: 36,
  minTermDays: 90,
  savingsAprPercent: 5,
  savingsDiscountPercent: 5,
  savingsThreshold: 100000,
  compound: false,
};

interface LoanQuote {
  apr: number;
  monthlyRate: number;
  interest: number;
  total: number;
  termDays: number;
  monthlyPayment: number;
}

function round(n: number): number {
  return Math.round(n);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeMonthlyPayment(amount: number, apr: number, termDays: number): number {
  const months = termDays / 30;
  const monthlyRate = apr / 12 / 100;
  if (monthlyRate === 0) return round(amount / months);
  const payment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return round(payment);
}

export function localQuote(amount: number, termDays: number, savingsBalance: number = 0): LoanQuote {
  const clampedTerm = clamp(termDays, COMPLIANCE.minTermDays, 365);
  let apr = COMPLIANCE.maxAprPercent;

  // Savings discount
  if (savingsBalance >= COMPLIANCE.savingsThreshold) {
    apr = apr * (1 - COMPLIANCE.savingsDiscountPercent / 100);
  }

  const monthlyRate = apr / 12;
  const months = clampedTerm / 30;
  const monthlyPayment = computeMonthlyPayment(amount, apr, clampedTerm);
  const total = round(monthlyPayment * months);
  const interest = total - amount;

  return {
    apr: apr / 100,
    monthlyRate: monthlyRate / 100,
    interest,
    total,
    termDays: clampedTerm,
    monthlyPayment,
  };
}
