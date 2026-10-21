import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessLoanPurpose } from "./business-loan-purpose.js";
test("validates multi-purpose applications without accepting duplicates or invalid choices", () => {
  assert.equal(isBusinessLoanPurpose("Business: Stock and inventory; Working capital; Other - Buy supplies; pay rent"), true);
  for (const invalid of ["Business: ", "Business: Working capital; Working capital", "Business: Inventory and stock; Stock and inventory", "Business: Stock and inventory; Personal", "Business: Stock and inventory; Other - "]) assert.equal(isBusinessLoanPurpose(invalid), false, invalid);
});

test("accepts the supported business loan purposes", () => {
  for (const purpose of [
    "Business: Stock and inventory",
    "Business: Raw materials and supplies",
    "Business: Equipment, tools and machinery",
    "Business: Agriculture and livestock",
    "Business: Transport and delivery",
    "Business: Business premises and improvements",
    "Business: Business operating expenses",
    "Business: Marketing and sales",
    "Business: Technology and digital tools",
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
