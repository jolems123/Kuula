/**
 * Singleton pg Pool. Created lazily so the test suite can override DATABASE_URL
 * before the first query. All modules import `pool` from here — never call
 * `new Pool()` directly.
 */
import { Pool, type PoolClient, type QueryResult } from "pg";
import { config } from "../config.js";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.db.url,
      // Postgres + Express: keep the pool modest; raise on the load-test rig.
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    _pool.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[pg pool] idle client error", err);
    });
  }
  return _pool;
}

/**
 * Run a query with the shared pool. T is the row type; callers access `.rows`.
 *
 *   const { rows } = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [id]);
 */
export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query(text, params) as Promise<QueryResult<T>>;
}

/**
 * Run a function inside a transaction. Rolls back on any error. Returns the
 * function's result.
 *
 *   const loan = await tx(async (db) => {
 *     const { rows } = await db.query("INSERT INTO loans ... RETURNING *");
 *     await db.query("UPDATE users ... WHERE id = $1", [userId]);
 *     return rows[0];
 *   });
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Test helper: close the pool. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
