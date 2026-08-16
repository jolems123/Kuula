import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-jwt-secret-that-is-long-enough-for-kuula-security-tests-123456789";

const { hasPermission } = await import("./auth.js");

test("field officer cannot globally review KYC or manage money controls", () => {
  assert.equal(hasPermission("officer", "loan.review"), true);
  assert.equal(hasPermission("officer", "customer.view"), true);
  assert.equal(hasPermission("officer", "kyc.review"), false);
  assert.equal(hasPermission("officer", "kyc.document.view"), false);
  assert.equal(hasPermission("officer", "credit_evidence.manage"), false);
  assert.equal(hasPermission("officer", "reconciliation.manage"), false);
});

test("credit manager cannot create treasury destinations or manufacture evidence", () => {
  assert.equal(hasPermission("manager", "loan.review"), true);
  assert.equal(hasPermission("manager", "loan.approve"), true);
  assert.equal(hasPermission("manager", "kyc.review"), true);
  assert.equal(hasPermission("manager", "credit_evidence.manage"), false);
  assert.equal(hasPermission("manager", "reconciliation.manage"), false);
  assert.equal(hasPermission("manager", "admin.manage"), false);
});

test("only administrator owns evidence and reconciliation control planes", () => {
  assert.equal(hasPermission("admin", "credit_evidence.manage"), true);
  assert.equal(hasPermission("admin", "reconciliation.manage"), true);
  assert.equal(hasPermission("admin", "admin.manage"), true);
});
