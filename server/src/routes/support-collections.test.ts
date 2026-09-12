import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const migration = readFileSync(new URL("../../prisma/migrations/20260912130000_support_and_collections_workflows/migration.sql", import.meta.url), "utf8");

test("collections access excludes unrelated staff roles", async () => {
  process.env.JWT_SECRET ||= "test-secret-at-least-32-characters";
  const { collectionRoles } = await import("./collections.js");
  assert.equal(collectionRoles.has("collections"), true);
  assert.equal(collectionRoles.has("administrator"), true);
  assert.equal(collectionRoles.has("loan_officer"), false);
  assert.equal(collectionRoles.has("final_approver"), false);
  assert.equal(collectionRoles.has("finance"), false);
  assert.equal(collectionRoles.has("support"), false);
  assert.equal(collectionRoles.has("kyc_officer"), false);
});

test("support and collections persistence constrains lifecycle values", () => {
  assert.match(migration, /support_tickets_status_check/);
  assert.match(migration, /status IN \('open','in_progress','closed'\)/);
  assert.match(migration, /collection_activity_type_check/);
  assert.match(migration, /promise_status IN \('pending','kept','broken','cancelled'\)/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
});
