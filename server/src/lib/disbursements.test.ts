import assert from "node:assert/strict";
import test from "node:test";
import { splitDisbursementAmount } from "./disbursements.js";

test("keeps a facility in one leg when it is within the provider limit", () => {
  assert.deepEqual(splitDisbursementAmount(2_000_000, 5_000_000), [2_000_000]);
});

test("splits an eight million facility into sequential five and three million legs", () => {
  assert.deepEqual(splitDisbursementAmount(8_000_000, 5_000_000), [5_000_000, 3_000_000]);
});

test("never creates a final leg below the provider minimum", () => {
  assert.deepEqual(splitDisbursementAmount(5_000_100, 5_000_000, 500), [4_999_600, 500]);
});

test("preserves the exact approved amount across many legs", () => {
  const legs = splitDisbursementAmount(15_750_000, 5_000_000, 500);
  assert.deepEqual(legs, [5_000_000, 5_000_000, 5_000_000, 750_000]);
  assert.equal(legs.reduce((sum, amount) => sum + amount, 0), 15_750_000);
  assert.ok(legs.every((amount) => amount <= 5_000_000));
});
