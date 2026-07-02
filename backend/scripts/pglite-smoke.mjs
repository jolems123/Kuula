/**
 * Smoke test the backend against an embedded PGlite (WASM Postgres) instance.
 *
 * This runs the actual SQL migrations and exercises the DB layer without
 * requiring a real Postgres install. Useful in CI / sandboxed environments.
 *
 *   node scripts/pglite-smoke.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import argon2 from "argon2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "src", "db", "migrations");

const db = new PGlite();

async function runMigrations() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const applied = new Set((await db.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    console.log(`  applying ${f}`);
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    // PGlite doesn't support CREATE EXTENSION citext/uuid-ossp; strip them.
    const stripped = sql
      .replace(/CREATE EXTENSION[^;]+;/g, "")
      .replace(/CITEXT/g, "TEXT")
      .replace(/uuid_generate_v4\(\)/g, "gen_random_uuid()");
    try {
      await db.exec(stripped);
      await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [f]);
    } catch (err) {
      console.error(`  FAILED on ${f}:`, err.message);
      throw err;
    }
  }
}

async function seed() {
  const adminPw = await argon2.hash("kuula-admin-2026", { type: argon2.argon2id });
  const userPin = await argon2.hash("1234", { type: argon2.argon2id });

  await db.query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, password_hash, kyc_status)
     VALUES ($1, 'admin', 'Admin Kavuma', 'AK', '+256700000001', $2, 'ADMIN-ID', 'January 1, 1990', 'Kampala', 'Kuula Staff', 'January 2020', TRUE, $3, 'verified')
     ON CONFLICT (id) DO NOTHING`,
    ["ADMIN-2024-000001", "admin@kuula.ug", adminPw],
  );
  await db.query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, pin_hash, kyc_status)
     VALUES ($1, 'user', 'Amara Nakato', 'AN', '+256770123456', 'amara.nakato@gmail.com', 'CM86H00P12PL', 'March 15, 1992', 'Kampala', 'Small Business Owner', 'January 2024', TRUE, $2, 'verified')
     ON CONFLICT (id) DO NOTHING`,
    ["KUU-2024-001847", userPin],
  );
  await db.query(
    `INSERT INTO credit_inputs (user_id, momo_months, momo_txn_count, crb_status, crb_score, avg_monthly_balance, kyc_verified)
     VALUES ($1, 18, 240, 'clean', 820, 75000, TRUE)
     ON CONFLICT (user_id) DO NOTHING`,
    ["KUU-2024-001847"],
  );
  await db.query(
    `INSERT INTO savings_accounts (user_id, balance, interest_apr) VALUES ($1, 340000, 0.05)
     ON CONFLICT (user_id) DO NOTHING`,
    ["KUU-2024-001847"],
  );
  await db.query(
    `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    ["KUU-2024-001847"],
  );
  console.log("  seed: admin + customer inserted");
}

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    process.exitCode = 1;
  }
}

await (async () => {
  console.log("Booting PGlite + running migrations…");
  await runMigrations();
  console.log("Migrations applied.\n");

  console.log("Seeding demo data…");
  await seed();
  console.log("");

  console.log("Running smoke tests…");

  await test("admin user exists in DB", async () => {
    const r = await db.query(`SELECT id, role FROM users WHERE email = $1`, ["admin@kuula.ug"]);
    if (!r.rows[0] || r.rows[0].role !== "admin") throw new Error("admin not found");
  });

  await test("customer user exists in DB", async () => {
    const r = await db.query(`SELECT id, role, verified FROM users WHERE phone = $1`, ["+256770123456"]);
    if (!r.rows[0] || r.rows[0].role !== "user" || !r.rows[0].verified) throw new Error("customer not found / not verified");
  });

  await test("admin password hash verifies against kuula-admin-2026", async () => {
    const r = await db.query(`SELECT password_hash FROM users WHERE email = $1`, ["admin@kuula.ug"]);
    if (!await argon2.verify(r.rows[0].password_hash, "kuula-admin-2026")) throw new Error("password mismatch");
  });

  await test("customer PIN hash verifies against 1234", async () => {
    const r = await db.query(`SELECT pin_hash FROM users WHERE phone = $1`, ["+256770123456"]);
    if (!await argon2.verify(r.rows[0].pin_hash, "1234")) throw new Error("PIN mismatch");
  });

  await test("savings balance seeded to 340000", async () => {
    const r = await db.query(`SELECT balance FROM savings_accounts WHERE user_id = $1`, ["KUU-2024-001847"]);
    if (Number(r.rows[0].balance) !== 340000) throw new Error(`expected 340000, got ${r.rows[0].balance}`);
  });

  await test("credit inputs seeded (momoMonths=18, txnCount=240, crb=clean)", async () => {
    const r = await db.query(`SELECT momo_months, momo_txn_count, crb_status FROM credit_inputs WHERE user_id = $1`, ["KUU-2024-001847"]);
    const c = r.rows[0];
    if (c.momo_months !== 18 || c.momo_txn_count !== 240 || c.crb_status !== "clean") throw new Error("credit inputs mismatch");
  });

  await test("savings deposit + withdraw updates balance correctly", async () => {
    await db.query(`UPDATE savings_accounts SET balance = balance + 60000 WHERE user_id = $1`, ["KUU-2024-001847"]);
    let r = await db.query(`SELECT balance FROM savings_accounts WHERE user_id = $1`, ["KUU-2024-001847"]);
    if (Number(r.rows[0].balance) !== 400000) throw new Error(`expected 400000 after deposit, got ${r.rows[0].balance}`);
    await db.query(`UPDATE savings_accounts SET balance = balance - 50000 WHERE user_id = $1`, ["KUU-2024-001847"]);
    r = await db.query(`SELECT balance FROM savings_accounts WHERE user_id = $1`, ["KUU-2024-001847"]);
    if (Number(r.rows[0].balance) !== 350000) throw new Error(`expected 350000 after withdraw, got ${r.rows[0].balance}`);
  });

  await test("loan application can be inserted + retrieved", async () => {
    const pricing = JSON.stringify({ principal: 200000, termDays: 91, apr: 0.336, interest: 16821, total: 216821 });
    await db.query(
      `INSERT INTO loan_applications (id, applicant_id, applicant_name, amount, purpose, term_days, channel, pricing, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      ["KUL-2026-00001", "KUU-2024-001847", "Amara Nakato", 200000, "emergency", 91, "mtn_momo", pricing],
    );
    const r = await db.query(`SELECT status, amount FROM loan_applications WHERE id = $1`, ["KUL-2026-00001"]);
    if (!r.rows[0] || r.rows[0].status !== "pending" || Number(r.rows[0].amount) !== 200000) throw new Error("loan application mismatch");
  });

  await test("loan approval flow creates loan + disbursement + repayment", async () => {
    const loanId = "LN-SMOKE-001";
    const disbId = "DISB-SMOKE-001";
    const due = new Date(Date.now() + 91 * 86400000);
    await db.query(
      `INSERT INTO loans (id, application_id, user_id, amount, term_days, interest_rate, service_fee_rate, interest, service_fee, total, apr, apr_clamped, status, disbursed_at, due_date)
       VALUES ($1, $2, $3, $4, 91, 0.336, 0, 16821, 0, 216821, 0.336, FALSE, 'active', NOW(), $5)`,
      [loanId, "KUL-2026-00001", "KUU-2024-001847", 200000, due],
    );
    await db.query(
      `INSERT INTO repayments (loan_id, total, amount_paid, status, auto_pay_enabled, due_date)
       VALUES ($1, 216821, 0, 'scheduled', TRUE, $2)`,
      [loanId, due],
    );
    await db.query(
      `INSERT INTO disbursements (id, application_id, user_id, amount, channel, msisdn, provider_ref, status, requested_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW(), NOW())`,
      [disbId, "KUL-2026-00001", "KUU-2024-001847", 200000, "mtn_momo", "+256770123456", "MTN-ABC123"],
    );
    const r = await db.query(`SELECT l.status, l.total, r.amount_paid FROM loans l JOIN repayments r ON r.loan_id = l.id WHERE l.id = $1`, [loanId]);
    if (!r.rows[0] || r.rows[0].status !== "active" || Number(r.rows[0].total) !== 216821) throw new Error("loan/disbursement mismatch");
  });

  await test("transaction ledger records disbursement", async () => {
    await db.query(
      `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, transaction_id, metadata)
       VALUES ($1, $2, $3, 'loan_disbursement', $4, 'completed', $5, $6)`,
      ["TX-SMOKE-001", "KUU-2024-001847", "LN-SMOKE-001", 200000, "MTN-ABC123", JSON.stringify({})],
    );
    const r = await db.query(`SELECT type, status, amount FROM transactions WHERE id = $1`, ["TX-SMOKE-001"]);
    if (!r.rows[0] || r.rows[0].type !== "loan_disbursement" || Number(r.rows[0].amount) !== 200000) throw new Error("transaction mismatch");
  });

  await test("message thread can be created + retrieved", async () => {
    await db.query(
      `INSERT INTO messages (id, sender_id, receiver_id, content, is_read, created_at)
       VALUES ('MSG-SMOKE-001', $1, $2, 'Hello Kuula support', FALSE, NOW())`,
      ["KUU-2024-001847", "ADMIN-2024-000001"],
    );
    const r = await db.query(`SELECT content FROM messages WHERE receiver_id = $1`, ["ADMIN-2024-000001"]);
    if (!r.rows[0] || r.rows[0].content !== "Hello Kuula support") throw new Error("message mismatch");
  });

  await test("notification can be created + unread count works", async () => {
    await db.query(
      `INSERT INTO notifications (id, user_id, title, body, type, read, created_at)
       VALUES ('NOTIF-SMOKE-001', $1, 'Test', 'Test body', 'info', FALSE, NOW())`,
      ["KUU-2024-001847"],
    );
    const r = await db.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read = FALSE`, ["KUU-2024-001847"]);
    if (Number(r.rows[0].c) < 1) throw new Error("notification unread count mismatch");
  });

  await test("audit log table exists + accepts rows", async () => {
    await db.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, 'approve_loan', 'loan_application', $2, $3)`,
      ["ADMIN-2024-000001", "KUL-2026-00001", JSON.stringify({ notes: "approved" })],
    );
    const r = await db.query(`SELECT action FROM audit_log WHERE target_id = $1`, ["KUL-2026-00001"]);
    if (!r.rows[0] || r.rows[0].action !== "approve_loan") throw new Error("audit log mismatch");
  });

  await test("refresh token row can be inserted + looked up by hash", async () => {
    const tokenHash = createHash("sha256").update("dummy-refresh-token").digest("hex");
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      ["KUU-2024-001847", tokenHash],
    );
    const r = await db.query(`SELECT user_id FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
    if (!r.rows[0] || r.rows[0].user_id !== "KUU-2024-001847") throw new Error("refresh token mismatch");
  });

  await test("soft delete (account deletion) works", async () => {
    await db.query(`INSERT INTO users (id, role, full_name, phone) VALUES ('KUU-DELETE-ME', 'user', 'Tmp', '+256999000999') ON CONFLICT DO NOTHING`);
    await db.query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, ["KUU-DELETE-ME"]);
    const r = await db.query(`SELECT deleted_at FROM users WHERE id = $1`, ["KUU-DELETE-ME"]);
    if (!r.rows[0]?.deleted_at) throw new Error("soft delete failed");
  });

  await test("OTP row can be inserted + marked used", async () => {
    const codeHash = await argon2.hash("123456", { type: argon2.argon2id });
    await db.query(
      `INSERT INTO otp_codes (key, code_hash, purpose, expires_at) VALUES ($1, $2, 'signup', NOW() + INTERVAL '10 minutes')`,
      ["+256999000999", codeHash],
    );
    await db.query(`UPDATE otp_codes SET used_at = NOW() WHERE key = $1`, ["+256999000999"]);
    const r = await db.query(`SELECT used_at FROM otp_codes WHERE key = $1 ORDER BY created_at DESC LIMIT 1`, ["+256999000999"]);
    if (!r.rows[0]?.used_at) throw new Error("OTP mark-used failed");
  });

  console.log("\nSmoke tests complete.");
  await db.close();
  process.exit(process.exitCode ?? 0);
})();
