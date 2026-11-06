// Exercises pg_dump -> pg_restore -> integrity verification on disposable CI data.
// This is not evidence of a production backup restore.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const source = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(["localhost", "127.0.0.1"].includes(source.hostname));
assert.equal(source.pathname, "/kuula_test");
assert.ok(process.env.CI_POSTGRES_CONTAINER, "Requires the disposable CI PostgreSQL container");
const tables = ["users", "loan_applications", "repayments", "transactions", "journals", "journal_entries", "audit_events"];
const prisma = new PrismaClient();
try {
  const counts = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS n FROM "${table}"`);
    counts[table] = Number(rows[0].n);
  }
  const pg = (...args) => execFileSync("docker", ["exec", process.env.CI_POSTGRES_CONTAINER, ...args], { stdio: "inherit", timeout: 60000 });
  pg("pg_dump", "-U", "kuula", "-d", "kuula_test", "--format=custom", "--file=/tmp/kuula-ci-restore.dump");
  pg("createdb", "-U", "kuula", "kuula_restore_drill");
  pg("pg_restore", "-U", "kuula", "-d", "kuula_restore_drill", "--exit-on-error", "/tmp/kuula-ci-restore.dump");
  const restored = new URL(source); restored.pathname = "/kuula_restore_drill";
  execFileSync(process.execPath, ["scripts/verify-isolated-restore.mjs"], { stdio: "inherit", timeout: 90000, env: { ...process.env, ISOLATED_DATABASE_URL: restored.href, RESTORE_AUDIT_CONFIRM: "ISOLATED", RESTORE_EXPECTED_COUNTS_JSON: JSON.stringify(counts), REAL_MONEY_ENABLED: "false" } });
  console.log("Disposable CI backup/restore roundtrip passed; production restore drill still required.");
} finally { await prisma.$disconnect(); }
