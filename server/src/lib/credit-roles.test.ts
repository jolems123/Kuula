import test from "node:test";
import assert from "node:assert/strict";
import { roleFitsLevel, roleLevel, rolesForLevelQuery } from "./credit-roles.js";

test("staff invited with the new roles can work their credit level", () => {
  assert.equal(roleFitsLevel("loan_officer", 1), true);
  assert.equal(roleFitsLevel("credit_manager", 2), true);
  assert.equal(roleFitsLevel("final_approver", 3), true);
  assert.equal(roleFitsLevel("officer", 1), true, "legacy accounts keep working");
  assert.equal(roleFitsLevel("loan_officer", 3), false);
  assert.equal(roleFitsLevel("finance", 2), false);
  assert.equal(roleLevel("support"), 0);
});

test("the staff picker returns every role for a level, whichever name the screen asks for", () => {
  assert.deepEqual([...rolesForLevelQuery("officer")!].sort(), ["loan_officer", "officer"]);
  assert.deepEqual([...rolesForLevelQuery("2")!].sort(), ["credit_manager", "manager"]);
  assert.ok(rolesForLevelQuery("admin")!.includes("final_approver"));
  assert.equal(rolesForLevelQuery("finance"), null);
  assert.equal(rolesForLevelQuery("")!.length, 8);
});
