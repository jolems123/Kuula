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

test("only the super admin may manage staff", () => {
  assert.equal(hasPermission("super_admin", "staff.manage"), true);
  assert.equal(hasPermission("administrator", "staff.manage"), false);
  assert.equal(hasPermission("admin", "staff.manage"), false);
  assert.equal(hasPermission("credit_manager", "staff.manage"), false);
  assert.equal(hasPermission("support", "staff.manage"), false);
});

test("dedicated staff roles stay least-privilege", () => {
  // Loan officers see their pipeline and customers, never KYC documents or money controls.
  assert.equal(hasPermission("loan_officer", "loan.review"), true);
  assert.equal(hasPermission("loan_officer", "loan.approve"), false);
  assert.equal(hasPermission("loan_officer", "kyc.document.view"), false);
  assert.equal(hasPermission("loan_officer", "reconciliation.manage"), false);

  // Final approvers release reviewed loans but cannot touch KYC or treasury.
  assert.equal(hasPermission("final_approver", "loan.approve"), true);
  assert.equal(hasPermission("final_approver", "kyc.review"), false);
  assert.equal(hasPermission("final_approver", "credit_evidence.manage"), false);

  // KYC officers review identities, never loan money.
  assert.equal(hasPermission("kyc_officer", "kyc.review"), true);
  assert.equal(hasPermission("kyc_officer", "kyc.document.view"), true);
  assert.equal(hasPermission("kyc_officer", "loan.approve"), false);

  // Finance reconciles, never approves loans or reviews KYC.
  assert.equal(hasPermission("finance", "reconciliation.manage"), true);
  assert.equal(hasPermission("finance", "loan.approve"), false);
  assert.equal(hasPermission("finance", "kyc.review"), false);

  // Collections and support never approve or reconcile.
  assert.equal(hasPermission("collections", "loan.approve"), false);
  assert.equal(hasPermission("collections", "customer.view"), true);
  assert.equal(hasPermission("support", "support.manage"), true);
  assert.equal(hasPermission("support", "loan.review"), false);

  // Administrators inherit the legacy admin control plane.
  assert.equal(hasPermission("administrator", "credit_evidence.manage"), true);
  assert.equal(hasPermission("administrator", "reconciliation.manage"), true);
  assert.equal(hasPermission("super_admin", "admin.manage"), true);
});
