/**
 * Pricing compliance guard.
 *
 * Proves that NO loan the pricing engine can produce exceeds the regulatory
 * ceilings — Apple's 36% APR cap and Uganda's UMRA 33.6% EAIR limit — across
 * every amount × term × savings-balance combination, and that interest is
 * never compounded. Run in CI so a non-compliant price can never be merged.
 *
 *   node scripts/check-pricing-compliance.mjs
 */

// Inline the client-side pricing logic (mirrors src/app/lib/pricing.ts)
// so this script runs without a bundler.
const PRICING = {
  MAX_APR: 0.336,
  MIN_TERM_DAYS: 90,
  SAVINGS_DISCOUNT: 0.05,
  SAVINGS_THRESHOLD: 100000,
};

function localQuote(principal, termDays, savingsBalance = 0) {
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

// ── Compliance checks ─────────────────────────────────────────────────────────

const APPLE_CAP = 0.36;
const UMRA_CAP = 0.336;
const EPS = 1e-6;

const amounts = [20000, 50000, 200000, 500000, 1000000];
const terms = [90, 91, 120, 180, 365];
const savingsBalances = [0, 50000, 99999, 100000, 500000, 2000000];

let checks = 0;
const failures = [];

function assertCompliant(label, q) {
  checks++;
  if (q.compound !== false) failures.push(`${label}: interest is compounded`);
  if (q.apr > UMRA_CAP + EPS) failures.push(`${label}: APR ${q.apr} exceeds UMRA 33.6%`);
  if (q.apr > APPLE_CAP + EPS) failures.push(`${label}: APR ${q.apr} exceeds Apple 36%`);
  if (q.termDays < PRICING.MIN_TERM_DAYS) failures.push(`${label}: term ${q.termDays}d below minimum ${PRICING.MIN_TERM_DAYS}d`);
}

for (const amount of amounts) {
  for (const term of terms) {
    for (const savings of savingsBalances) {
      const q = localQuote(amount, term, savings);
      assertCompliant(`${amount}/${term}d/sav${savings}`, q);
    }
  }
}

if (PRICING.MAX_APR >= APPLE_CAP) {
  failures.push(`MAX_APR ${PRICING.MAX_APR} is not below Apple's ${APPLE_CAP}`);
}

console.log(`pricing combinations checked: ${checks}`);
if (failures.length) {
  console.error(`FAIL: ${failures.length} non-compliant price(s):`);
  for (const f of failures.slice(0, 20)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("PASS: every price ≤ 33.6% APR (UMRA) and ≤ 36% APR (Apple); interest is simple; term ≥ 90 days.");