import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-only-secret-that-is-long-enough-for-role-route-tests";

test("dedicated credit roles map to their actual review levels", async () => {
  const { roleLevel } = await import("./credit-operations.js");
  assert.equal(roleLevel("loan_officer"), 1);
  assert.equal(roleLevel("credit_manager"), 2);
  assert.equal(roleLevel("final_approver"), 3);
  assert.equal(roleLevel("administrator"), 3);
  assert.equal(roleLevel("support"), 0);
  assert.equal(roleLevel("finance"), 0);
  assert.equal(roleLevel("kyc_officer"), 0);
});
