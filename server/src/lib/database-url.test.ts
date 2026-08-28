import test from "node:test";
import assert from "node:assert/strict";
import { databaseUrlWithPoolDefaults } from "./database-url.js";

test("adds conservative Prisma pool defaults", () => {
  const configured = new URL(databaseUrlWithPoolDefaults("postgresql://user:pass@db.internal:5432/kuula?schema=public"));
  assert.equal(configured.searchParams.get("schema"), "public");
  assert.equal(configured.searchParams.get("connection_limit"), "5");
  assert.equal(configured.searchParams.get("pool_timeout"), "10");
});

test("preserves explicit Prisma pool settings", () => {
  const configured = new URL(databaseUrlWithPoolDefaults("postgres://user:pass@db.internal/kuula?connection_limit=3&pool_timeout=20"));
  assert.equal(configured.searchParams.get("connection_limit"), "3");
  assert.equal(configured.searchParams.get("pool_timeout"), "20");
});

test("rejects non-PostgreSQL database URLs", () => {
  assert.throws(() => databaseUrlWithPoolDefaults("mysql://user:pass@db/kuula"), /PostgreSQL/);
});
