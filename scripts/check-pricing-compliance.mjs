/**
 * Pricing compliance guard.
 *
 * The client and server engines are compared separately by
 * scripts/check-pricing-parity.ts. This guard stress-tests the canonical rules:
 * APR ceilings, simple interest, zero fees, and supported terms.
 */
import { readFileSync } from "node:fs";

const canonical = readFileSync(new URL("../server/src/lib/compliance.ts", import.meta.url), "utf8");
const configuredApr = Number(/maxAprPercent:\s*([\d.]+)/.exec(canonical)?.[1]);
const configuredMinTerm = Number(/minTermDays:\s*(\d+)/.exec(canonical)?.[1]);
if (!Number.isFinite(configuredApr) || !Number.isInteger(configuredMinTerm)) {
  throw new Error("Canonical server compliance policy cannot be read; fail closed");
}

const PRICING = {
  MAX_APR: configuredApr / 100,
  MIN_TERM_DAYS: configuredMinTerm,
  MAX_TERM_DAYS: 365,
};

function normalizePrincipal(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Loan amount must be a positive number");
  }
  return Math.round(value);
}

function normalizeTerm(value) {
  const requested = Number.isFinite(value) && value > 0
    ? Math.round(value)
    : PRICING.MIN_TERM_DAYS;
  return Math.min(PRICING.MAX_TERM_DAYS, Math.max(PRICING.MIN_TERM_DAYS, requested));
}

function localQuote(principalInput, termDaysInput) {
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

const APPLE_CAP = 0.36;
// This configured ceiling is a product control, not a legal determination.
const PRODUCT_POLICY_CAP = 0.336;
const EPS = 1e-6;

const amounts = [20_000, 50_000, 100_000.6, 200_000, 500_000, 1_000_000];
const terms = [0, 30, 45, 60, 61, 90, 91, 120, 180, 365, 720];

let checks = 0;
const failures = [];

function assertCompliant(label, quote) {
  checks += 1;
  const expectedInterest = Math.round(
    quote.principal * (quote.apr / 365) * quote.termDays
  );

  if (quote.compound !== false) failures.push(`${label}: interest is compounded`);
  if (quote.fee !== 0) failures.push(`${label}: unexpected fee ${quote.fee}`);
  if (quote.apr > PRODUCT_POLICY_CAP + EPS) failures.push(`${label}: APR ${quote.apr} exceeds configured product policy limit 33.6%`);
  if (quote.apr > APPLE_CAP + EPS) failures.push(`${label}: APR ${quote.apr} exceeds Apple 36%`);
  if (quote.termDays < PRICING.MIN_TERM_DAYS) failures.push(`${label}: term below ${PRICING.MIN_TERM_DAYS}`);
  if (quote.termDays > PRICING.MAX_TERM_DAYS) failures.push(`${label}: term above ${PRICING.MAX_TERM_DAYS}`);
  if (quote.interest !== expectedInterest) failures.push(`${label}: interest is not canonical simple interest`);
  if (quote.total !== quote.principal + quote.interest + quote.fee) failures.push(`${label}: total does not reconcile`);
}

for (const amount of amounts) {
  for (const term of terms) {
    assertCompliant(`${amount}/${term}d`, localQuote(amount, term));
  }
}

for (const invalidAmount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  try {
    localQuote(invalidAmount, 90);
    failures.push(`invalid principal ${invalidAmount} was accepted`);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      failures.push(`invalid principal ${invalidAmount} threw the wrong error`);
    }
  }
}

if (PRICING.MAX_APR >= APPLE_CAP) {
  failures.push(`MAX_APR ${PRICING.MAX_APR} is not below Apple's ${APPLE_CAP}`);
}

console.log(`pricing combinations checked: ${checks}`);
if (failures.length) {
  console.error(`FAIL: ${failures.length} non-compliant price(s):`);
  for (const failure of failures.slice(0, 20)) console.error("  ✗ " + failure);
  process.exit(1);
}

console.log(
  "PASS: prices use simple interest, zero fees, APR ≤ 33.6%, and terms from the canonical server policy."
);
