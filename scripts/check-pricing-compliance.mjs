/**
 * Pricing compliance guard.
 *
 * The client and server engines are compared separately by
 * scripts/check-pricing-parity.ts. This guard stress-tests the canonical rules:
 * APR ceilings, simple interest, zero fees, and supported term boundaries.
 */
const PRICING = {
  MAX_APR: 0.336,
  MIN_TERM_DAYS: 90,
  MAX_TERM_DAYS: 365,
  SAVINGS_DISCOUNT: 0.05,
  SAVINGS_THRESHOLD: 100000,
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

function localQuote(principalInput, termDaysInput, savingsBalance = 0) {
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

const APPLE_CAP = 0.36;
const UMRA_CAP = 0.336;
const EPS = 1e-6;

const amounts = [20_000, 50_000, 100_000.6, 200_000, 500_000, 1_000_000];
const terms = [0, 30, 90, 91, 120, 180, 365, 720];
const savingsBalances = [0, 50_000, 99_999, 100_000, 500_000, 2_000_000];

let checks = 0;
const failures = [];

function assertCompliant(label, quote) {
  checks += 1;
  const expectedInterest = Math.round(
    quote.principal * (quote.apr / 365) * quote.termDays
  );

  if (quote.compound !== false) failures.push(`${label}: interest is compounded`);
  if (quote.fee !== 0) failures.push(`${label}: unexpected fee ${quote.fee}`);
  if (quote.apr > UMRA_CAP + EPS) failures.push(`${label}: APR ${quote.apr} exceeds UMRA 33.6%`);
  if (quote.apr > APPLE_CAP + EPS) failures.push(`${label}: APR ${quote.apr} exceeds Apple 36%`);
  if (quote.termDays < PRICING.MIN_TERM_DAYS) failures.push(`${label}: term below ${PRICING.MIN_TERM_DAYS}`);
  if (quote.termDays > PRICING.MAX_TERM_DAYS) failures.push(`${label}: term above ${PRICING.MAX_TERM_DAYS}`);
  if (quote.interest !== expectedInterest) failures.push(`${label}: interest is not canonical simple interest`);
  if (quote.total !== quote.principal + quote.interest + quote.fee) failures.push(`${label}: total does not reconcile`);
}

for (const amount of amounts) {
  for (const term of terms) {
    for (const savings of savingsBalances) {
      assertCompliant(
        `${amount}/${term}d/sav${savings}`,
        localQuote(amount, term, savings)
      );
    }
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
  "PASS: all prices use simple interest, zero fees, APR ≤ 33.6%, and terms from 90 to 365 days."
);
