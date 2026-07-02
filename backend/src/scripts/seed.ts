/**
 * Seed script. Creates:
 *   - 1 admin:    admin@kuula.ug / kuula-admin-2026
 *   - 1 customer: +256 770 123 456 / PIN 1234 (the demo creds the frontend uses)
 *
 * Idempotent: skips rows that already exist. Safe to re-run.
 *
 *   npm run seed
 */
import { query } from "../db/client.js";
import { hashPassword, hashPin } from "../lib/crypto.js";
import { computeCreditScore, COMPLIANCE } from "../lib/core.js";
import { logger } from "../middleware/logger.js";

const ADMIN_ID = "ADMIN-2024-000001";
const USER_ID = "KUU-2024-001847";

async function upsertAdmin(): Promise<void> {
  const passwordHash = await hashPassword("kuula-admin-2026");
  await query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, password_hash, kyc_status)
     VALUES ($1, 'admin', 'Admin Kavuma', 'AK', '+256700000001', $2, 'ADMIN-ID', 'January 1, 1990', 'Kampala', 'Kuula Staff', 'January 2020', TRUE, $3, 'verified')
     ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, verified = TRUE`,
    [ADMIN_ID, "admin@kuula.ug", passwordHash],
  );
  logger.info("seed: admin ready (admin@kuula.ug / kuula-admin-2026)");
}

async function upsertCustomer(): Promise<void> {
  const pinHash = await hashPin("1234");
  await query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, pin_hash, kyc_status, kyc_verified_at)
     VALUES ($1, 'user', 'Amara Nakato', 'AN', '+256770123456', 'amara.nakato@gmail.com', 'CM86H00P12PL', 'March 15, 1992', 'Kampala', 'Small Business Owner', 'January 2024', TRUE, $2, 'verified', NOW())
     ON CONFLICT (id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, verified = TRUE, kyc_status = 'verified'`,
    [USER_ID, pinHash],
  );

  await query(
    `INSERT INTO credit_inputs (user_id, momo_months, momo_txn_count, crb_status, crb_score, avg_monthly_balance, kyc_verified)
     VALUES ($1, 18, 240, 'clean', 820, 75000, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET momo_months = EXCLUDED.momo_months, momo_txn_count = EXCLUDED.momo_txn_count, crb_status = EXCLUDED.crb_status, crb_score = EXCLUDED.crb_score, avg_monthly_balance = EXCLUDED.avg_monthly_balance, kyc_verified = TRUE`,
    [USER_ID],
  );

  await query(
    `INSERT INTO savings_accounts (user_id, balance, interest_apr) VALUES ($1, 340000, $2)
     ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance`,
    [USER_ID, COMPLIANCE.SAVINGS_APR],
  );

  await query(
    `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)
     ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance`,
    [USER_ID],
  );

  // Seed a sample support thread so the chat UI is not empty.
  await query(
    `INSERT INTO messages (id, sender_id, receiver_id, content, is_read, created_at) VALUES
      ('MSG-SEED-001', $1, $2, 'Hello, I have a question about my loan payment.', TRUE, NOW() - INTERVAL '2 hours'),
      ('MSG-SEED-002', $2, $1, 'Hi Amara! Of course — what would you like to know?', TRUE, NOW() - INTERVAL '2 hours'),
      ('MSG-SEED-003', $1, $2, 'When is my next payment due?', FALSE, NOW() - INTERVAL '1 hour')
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID, ADMIN_ID],
  );

  // Seed notifications.
  await query(
    `INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES
      ('NOTIF-SEED-001', $1, 'Payment Due Soon', 'Your loan payment of UGX 285,000 is due in 14 days.', 'warning', FALSE, NOW() - INTERVAL '2 hours'),
      ('NOTIF-SEED-002', $1, 'Credit Score Improved!', 'Your score increased by 12 points to 742 — Excellent tier.', 'success', FALSE, NOW() - INTERVAL '3 days'),
      ('NOTIF-SEED-003', $1, 'Savings Goal Progress', 'You''ve saved 34% of your Emergency Fund goal.', 'info', TRUE, NOW() - INTERVAL '7 days'),
      ('NOTIF-SEED-004', $1, 'Loan Disbursed', 'UGX 500,000 has been sent to your MTN MoMo +256 770 123 456.', 'success', TRUE, NOW() - INTERVAL '15 days')
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID],
  );

  // Seed savings goals.
  await query(
    `INSERT INTO savings_goals (id, user_id, name, target, saved, deadline, emoji) VALUES
      ('GOAL-SEED-001', $1, 'Emergency Fund', 1000000, 340000, 'Dec 2026', '🏦'),
      ('GOAL-SEED-002', $1, 'School Fees', 750000, 180000, 'Sep 2026', '📚'),
      ('GOAL-SEED-003', $1, 'Business Capital', 2000000, 620000, 'Mar 2027', '💼')
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID],
  );

  const score = computeCreditScore({
    momoMonths: 18, momoTxnCount: 240, crbStatus: "clean",
    savingsBalance: 340000, kycVerified: true, loansRepaid: 8, loansTotal: 8,
  });
  await query(
    `INSERT INTO credit_score_history (user_id, score, max_score, tier, percentile, factors) VALUES ($1, $2, $3, $4, $5, $6)`,
    [USER_ID, score.score, score.maxScore, score.tier, score.percentile, JSON.stringify(score.factors)],
  );

  logger.info("seed: customer ready (+256 770 123 456 / PIN 1234)");
}

async function main(): Promise<void> {
  await upsertAdmin();
  await upsertCustomer();
  logger.info("seed: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "seed failed");
    process.exit(1);
  });
