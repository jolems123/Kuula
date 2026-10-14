// Read-only audit of an ALREADY restored, isolated Kuula PostgreSQL database.
// Never restores, migrates, deletes, exports customer data, or connects to production.
// Usage: ISOLATED_DATABASE_URL='postgresql://.../kuula_restore_drill' RESTORE_AUDIT_CONFIRM=ISOLATED node scripts/verify-isolated-restore.mjs
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const urlText = process.env.ISOLATED_DATABASE_URL;
if (process.env.RESTORE_AUDIT_CONFIRM !== "ISOLATED" || !urlText) {
  console.error("Set ISOLATED_DATABASE_URL and RESTORE_AUDIT_CONFIRM=ISOLATED; this script is read-only.");
  process.exit(2);
}
let target;
try { target = new URL(urlText); } catch { console.error("Invalid isolated database URL"); process.exit(2); }
const db = decodeURIComponent(target.pathname.slice(1));
if (!/^(postgres|postgresql):$/.test(target.protocol) || !/(?:restore|isolated|drill)/i.test(db)) {
  console.error("Refusing connection: destination database name must clearly identify an isolated restore/drill.");
  process.exit(2);
}
if (process.env.DATABASE_URL) {
  const prod = new URL(process.env.DATABASE_URL);
  if (prod.host === target.host && decodeURIComponent(prod.pathname) === decodeURIComponent(target.pathname)) {
    console.error("Refusing connection: isolated destination matches DATABASE_URL.");
    process.exit(2);
  }
}
if (process.env.REAL_MONEY_ENABLED === "true") {
  console.error("Refusing audit while REAL_MONEY_ENABLED=true.");
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url: urlText } } });
const tableNames = ["users", "loan_applications", "repayments", "transactions", "journals", "journal_entries", "audit_events"];
try {
  // Everything runs in a PostgreSQL read-only transaction. No identities or individual loan records are output.
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const identity = await tx.$queryRawUnsafe("SELECT current_database() AS name");
    assert.equal(identity[0].name, db, "Connected to unexpected database");
    const counts = {};
    for (const table of tableNames) {
      const result = await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS n FROM "' + table + '"');
      counts[table] = Number(result[0].n);
      assert.ok(Number.isSafeInteger(counts[table]), "Invalid row count");
    }
    const badJournals = await tx.$queryRawUnsafe(`
      SELECT COUNT(*)::text AS n FROM (
        SELECT j.id FROM journals j LEFT JOIN journal_entries e ON e.journal_id=j.id
        GROUP BY j.id
        HAVING COALESCE(SUM(CASE WHEN e.direction='debit' THEN e.amount WHEN e.direction='credit' THEN -e.amount ELSE 0 END),0) <> 0
           OR COUNT(e.id) = 0
      ) unmatched`);
    const missingJournalLinks = await tx.$queryRawUnsafe(`
      SELECT COUNT(*)::text AS n FROM journals j
      LEFT JOIN transactions t ON t.id=j.transaction_id
      WHERE t.id IS NULL`);
    return { database: db, counts, unbalancedJournals: Number(badJournals[0].n), orphanedJournals: Number(missingJournalLinks[0].n) };
  }, { timeout: 60000 });
  assert.equal(report.unbalancedJournals, 0, "Unbalanced journal detected");
  assert.equal(report.orphanedJournals, 0, "Orphan journal detected");
  if (process.env.RESTORE_EXPECTED_COUNTS_JSON) {
    const expected = JSON.parse(process.env.RESTORE_EXPECTED_COUNTS_JSON);
    for (const table of tableNames) {
      assert.equal(report.counts[table], expected[table], "Count mismatch for " + table);
    }
  }
  console.log(JSON.stringify({ status: "PASS", ...report, countsCompared: Boolean(process.env.RESTORE_EXPECTED_COUNTS_JSON) }));
} catch (err) {
  console.error("Restore audit failed:", err instanceof Error ? err.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
