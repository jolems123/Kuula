import assert from "node:assert/strict";
import { test } from "node:test";
import { guarantorCleared, canSignGuarantor, requiresIndependentGuarantorReview, guaranteeSignatureHash } from "./guarantor-policy.js";

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
test("a stored guarantee snapshot re-hashes to its signature despite reordered keys", () => {
  const signed = { principal: 200000, applicationId: "a", offerExpiresAt: new Date("2026-11-11T10:00:00.000Z"), guarantorName: "G" };
  // What Postgres JSONB hands back: keys reordered, the date as an ISO string.
  const stored = JSON.parse(JSON.stringify({ guarantorName: "G", principal: 200000, applicationId: "a", offerExpiresAt: "2026-11-11T10:00:00.000Z" }));
  assert.equal(guaranteeSignatureHash(stored), guaranteeSignatureHash(signed));
  assert.notEqual(guaranteeSignatureHash({ ...stored, principal: 300000 }), guaranteeSignatureHash(signed));
});
