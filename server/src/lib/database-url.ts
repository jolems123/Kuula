const DEFAULT_CONNECTION_LIMIT = 5;
const DEFAULT_POOL_TIMEOUT_SECONDS = 10;

/**
 * Apply conservative Prisma pool defaults without overriding explicit values.
 * Each Railway replica owns its own Prisma pool, so a small per-process default
 * avoids exhausting PostgreSQL during rolling deploys or horizontal scaling.
 */
export function databaseUrlWithPoolDefaults(value: string): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT_SECONDS));
  }
  return url.toString();
}
