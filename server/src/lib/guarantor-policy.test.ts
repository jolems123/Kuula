import assert from "node:assert/strict";
import { test } from "node:test";
import { guarantorCleared, canSignGuarantor, requiresIndependentGuarantorReview } from "./guarantor-policy.js";

test("guarantor is optional without a recorded requirement", () => {
  assert.equal(guarantorCleared(null), true);
  assert.equal(guarantorCleared(undefined), true);
  assert.equal(guarantorCleared("not_required"), true);
});
test("required, signed pending review, and unknown states block payment", () => {
  for (const value of ["required", "signed_pending_review", "rejected", "pending", "unexpected"]) {
    assert.equal(guarantorCleared(value), false, value);
  }
  assert.equal(guarantorCleared("waived"), true);
  assert.equal(guarantorCleared("verified"), true);
});
test("only final offered terms may be signed", () => {
  assert.equal(canSignGuarantor("required","offered"),true);
  assert.equal(canSignGuarantor("required","pending"),false);
  assert.equal(canSignGuarantor("waived","offered"),false);
  assert.equal(requiresIndependentGuarantorReview("signed_pending_review"),true);
  assert.equal(requiresIndependentGuarantorReview("verified"),false);
});
