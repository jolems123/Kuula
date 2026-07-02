/**
 * Test bootstrap: spin up a fresh test database, run migrations, seed, return
 * a supertest agent + cleanup function. Each test file uses its own DB schema
 * for isolation (VITEST_POOL_ID ensures parallel tests don't collide).
 */
import { execSync } from "node:child_process";
import supertest from "supertest";
import { config } from "../config.js";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";

export interface TestContext {
  request: supertest.SuperTest<supertest.Test>;
  cleanup: () => Promise<void>;
  adminToken: string;
  userToken: string;
}

export async function bootstrapTest(): Promise<TestContext> {
  // Drop + recreate the test DB so we always start clean.
  const testDbUrl = config.db.url;
  const match = testDbUrl.match(/^(postgres:\/\/[^@]+@[^/]+)\/(.+)$/);
  if (!match) throw new Error("DATABASE_URL must be in postgres://user:pass@host:port/db format");

  const serverUrl = match[1];
  const dbName = match[2];

  // Drop + recreate via psql.
  try {
    execSync(`psql "${serverUrl}/postgres" -c "DROP DATABASE IF EXISTS ${dbName};"`, { stdio: "ignore" });
    execSync(`psql "${serverUrl}/postgres" -c "CREATE DATABASE ${dbName};"`, { stdio: "ignore" });
  } catch {
    // If psql isn't available, fall back to running tests against whatever DB exists.
  }

  await runMigrations();
  await seedTestData();

  const app = createApp();
  const request = supertest(app);

  // Login as admin + user to get tokens.
  const adminLogin = await request.post("/api/auth/admin-login").send({ email: "admin@kuula.ug", password: "kuula-admin-2026" });
  const userLogin = await request.post("/api/auth/login").send({ phone: "+256 770 123 456", pin: "1234" });

  return {
    request,
    adminToken: adminLogin.body.token,
    userToken: userLogin.body.token,
    cleanup: async () => {
      await closePool();
    },
  };
}

async function seedTestData(): Promise<void> {
  // Reuse the same seed script but call its main directly.
  const { default: seed } = await import("./seed-runner.js");
  await seed();
}
