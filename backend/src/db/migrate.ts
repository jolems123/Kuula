/**
 * Migration runner. Wraps node-pg-migrate so the server can run pending
 * migrations automatically on boot (config.db.autoMigrate=true) without
 * requiring a separate `npm run migrate` step in dev.
 *
 * Uses pg_advisory_lock so two API instances can't migrate concurrently.
 */
import { getPool } from "./client.js";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

interface MigrationFile {
  name: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  return files.map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));
}

/** Apply pending migrations inside a server-side advisory lock. */
export async function runMigrations(): Promise<{ applied: string[] }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(0x4b55554c)"); // 'KUUL'
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows: appliedRows } = await client.query<{ name: string }>(`SELECT name FROM schema_migrations`);
    const applied = new Set(appliedRows.map((r) => r.name));
    const all = loadMigrations();
    const pending = all.filter((m) => !applied.has(m.name));

    for (const m of pending) {
      logger.info({ migration: m.name }, "applying migration");
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m.name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    return { applied: pending.map((m) => m.name) };
  } finally {
    await client.query("SELECT pg_advisory_unlock(0x4b55554c)").catch(() => {});
    client.release();
  }
}

// Allow `node src/db/migrate.js` to run migrations explicitly.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (config.db.autoMigrate) {
    runMigrations()
      .then(({ applied }) => {
        logger.info({ applied }, "migrations complete");
        process.exit(0);
      })
      .catch((err) => {
        logger.error({ err }, "migration failed");
        process.exit(1);
      });
  } else {
    logger.warn("AUTO_MIGRATE=false; skipping");
    process.exit(0);
  }
}
