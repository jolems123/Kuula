import assert from "node:assert/strict";
import { localQuote as clientQuote } from "../src/app/lib/pricing.ts";
import { localQuote as serverQuote } from "../server/src/lib/pricing.ts";

const amounts = [20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
const terms = [0, 30, 90, 91, 120, 180, 365, 720];
const savingsBalances = [0, 99_999, 100_000, 500_000];

let comparisons = 0;

for (const amount of amounts) {
  for (const term of terms) {
    for (const savings of savingsBalances) {
      const client = clientQuote(amount, term, savings);
      const server = serverQuote(amount, term, savings);
      assert.deepEqual(
        server,
        client,
        `Pricing mismatch for amount=${amount}, term=${term}, savings=${savings}`
      );
      comparisons += 1;
    }
  }
}

for (const invalidAmount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => clientQuote(invalidAmount, 90), RangeError);
  assert.throws(() => serverQuote(invalidAmount, 90), RangeError);
}

console.log(`PASS: client and server pricing match for ${comparisons} combinations.`);
