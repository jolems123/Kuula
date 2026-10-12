import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessLoanPurpose } from "./business-loan-purpose.js";

test("accepts the supported business loan purposes", () => {
  for (const purpose of [
    "Business: Inventory and stock",
    "Business: Equipment and tools",
    "Business: Working capital",
    "Business: Business expansion",
    "Business: Other - Purchase a refrigerated display",
  ]) {
    assert.equal(isBusinessLoanPurpose(purpose), true, purpose);
  }
});

test("rejects non-business purposes and invalid Other details", () => {
  for (const purpose of [
    "Personal",
    "Business",
    "School Fees",
    "Business: Other - ",
    `Business: Other - ${"x".repeat(101)}`,
    "Business: Other - details ",
  ]) {
    assert.equal(isBusinessLoanPurpose(purpose), false, purpose);
  }
});
