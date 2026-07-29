import { defineConfig } from "vitest/config";

/**
 * Server tests run against a REAL PostgreSQL database (`kuula_test`), not a
 * mock. The remediation being verified is largely made of row locks, partial
 * unique indexes and CHECK constraints — an in-memory fake would assert that
 * the test double behaves, not that the database enforces anything.
 *
 * Only the payment provider is stubbed, and only at its HTTP boundary.
 *
 * Setup:
 *   createdb kuula_test
 *   set -a && . ./.env.test && set +a && npx prisma migrate deploy
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Financial concurrency tests share tables and take real row locks, so they
    // must not run against each other.
    fileParallelism: false,
    pool: "forks",
    maxForks: 1,
    minForks: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
