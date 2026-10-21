import test from "node:test";
import assert from "node:assert/strict";
import { assertLoanIdentityApproved } from "./loan-identity.js";
test("loan applications require approved documents, not an upload or stale verification flag", async () => {
  for (const status of [null, "pending", "rejected", "superseded"]) {
    await assert.rejects(assertLoanIdentityApproved({phoneVerified:true,kycVerified:true}, async()=>status ? {status} : null), /verified and approved/);
  }
  await assert.rejects(assertLoanIdentityApproved({phoneVerified:true,kycVerified:false},async()=>({status:"verified"})), /verified and approved/);
  await assert.rejects(assertLoanIdentityApproved({phoneVerified:false,kycVerified:true},async()=>({status:"verified"})), /phone/);
  await assertLoanIdentityApproved({phoneVerified:true,kycVerified:true},async()=>({status:"verified"}));
});
