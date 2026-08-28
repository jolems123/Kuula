import assert from "node:assert/strict";
import { localQuote as clientQuote } from "../src/app/lib/pricing.ts";
import { localQuote as serverQuote } from "../server/src/lib/pricing.ts";

const amounts = [20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
const terms = [0, 30, 90, 91, 120, 180, 365, 720];
let comparisons = 0;

for (const amount of amounts) {
  for (const term of terms) {
    const client = clientQuote(amount, term);
    const server = serverQuote(amount, term);
    assert.deepEqual(server, client, `Pricing mismatch for amount=${amount}, term=${term}`);
    comparisons += 1;
  }
}

for (const invalidAmount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => clientQuote(invalidAmount, 90), RangeError);
  assert.throws(() => serverQuote(invalidAmount, 90), RangeError);
}

console.log(`PASS: client and server pricing match for ${comparisons} combinations.`);
