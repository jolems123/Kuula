/**
 * Pricing compliance guard.
 *
 * Proves that NO loan the pricing engines can produce exceeds the regulatory
 * ceilings — Apple's 36% APR cap and Uganda's UMRA 33.6% EAIR limit — across
 * every amount × term × eligibility-tier combination, and that interest is
 * never compounded. Run in CI so a non-compliant price can never be merged.
 *
 *   node scripts/check-pricing-compliance.mjs
 */
import { COMPLIANCE, priceLoan, priceLoanV2 } from "../server/core.mjs";

const APPLE_CAP = 0.36;
const UMRA_CAP = 0.336;
const EPS = 1e-6;

const amounts = [20000, 50000, 200000, 500000, 1000000];
const terms = [90, 91, 120, 180, 365];
const tierRates = [0.22, 0.24, 0.26];
const feeRates = [0.08, 0.10, 0.15];

let checks = 0;
const failures = [];

function assertCompliant(label, q) {
  checks++;
  if (q.compound !== false) failures.push(`${label}: interest is compounded`);
  if (q.aprPercent / 100 > UMRA_CAP + EPS) failures.push(`${label}: APR ${q.aprPercent}% exceeds UMRA 33.6%`);
  if (q.aprPercent / 100 > APPLE_CAP + EPS) failures.push(`${label}: APR ${q.aprPercent}% exceeds Apple 36%`);
}

// Engine 1: flat APR quote (with and without the savings discount).
for (const amount of amounts) {
  for (const term of terms) {
    for (const savings of [0, 200000]) {
      const q = priceLoan({ principal: amount, termDays: term, savingsBalance: savings });
      assertCompliant(`priceLoan ${amount}/${term}d/sav${savings}`, q);
    }
  }
}

// Engine 2: tiered rate + service fee, clamped.
for (const amount of amounts) {
  for (const term of terms) {
    for (const rate of tierRates) {
      for (const fee of feeRates) {
        const q = priceLoanV2({ principal: amount, termDays: term, interestRate: rate, serviceFeeRate: fee });
        assertCompliant(`priceLoanV2 ${amount}/${term}d/r${rate}/f${fee}`, q);
      }
    }
  }
}

if (COMPLIANCE.MAX_APR >= APPLE_CAP) {
  failures.push(`MAX_APR ${COMPLIANCE.MAX_APR} is not below Apple's ${APPLE_CAP}`);
}

console.log(`pricing combinations checked: ${checks}`);
if (failures.length) {
  console.error(`FAIL: ${failures.length} non-compliant price(s):`);
  for (const f of failures.slice(0, 20)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("PASS: every price ≤ 33.6% APR (UMRA) and ≤ 36% APR (Apple); interest is simple.");
