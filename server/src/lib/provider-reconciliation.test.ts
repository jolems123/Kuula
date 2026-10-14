import test from "node:test";
import assert from "node:assert/strict";
import { compareWithProvider } from "./provider-reconciliation.js";

const kuula = (reference: string, status: string, amount = 10_000) => ({ id: reference, reference, type: "loan_payment", status, amount });
const marz = (references: string[], status: string, amount: number | null = 10_000) => ({ uuid: `u-${references[0]}`, references, status, amount, type: "collection" });

test("matching records produce no exceptions", () => {
  const result = compareWithProvider([kuula("a", "completed"), kuula("b", "pending")], [marz(["a"], "completed"), marz(["sys-b", "b"], "processing")]);
  assert.equal(result.summary.matched, 2);
  assert.deepEqual(result.exceptions, []);
});

test("every kind of difference is reported", () => {
  const result = compareWithProvider(
    [kuula("only-kuula", "completed"), kuula("status", "pending"), kuula("amount", "completed", 10_000), kuula("rejected", "failed")],
    [marz(["status"], "completed"), marz(["amount"], "completed", 9_000), marz(["only-marzpay"], "completed", 5_000)],
  );
  assert.deepEqual(result.exceptions.map((exception) => exception.kind).sort(), ["amount_mismatch", "missing_at_kuula", "missing_at_provider", "status_mismatch"]);
  assert.equal(result.summary.matched, 1, "a request MarzPay rejected is expected to be absent there");
  assert.equal(result.summary.providerCompletedAmount, 24_000);
});
