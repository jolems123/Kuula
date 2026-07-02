/**
 * Wrapper to run the seed script's main() programmatically (the seed file
 * calls process.exit at the bottom, so we extract its work here).
 */
import { query } from "../db/client.js";
import { hashPassword, hashPin } from "../lib/crypto.js";
import { computeCreditScore, COMPLIANCE } from "../lib/core.js";
import { logger } from "../middleware/logger.js";

const ADMIN_ID = "ADMIN-2024-000001";
const USER_ID = "KUU-2024-001847";

export async function seed(): Promise<void> {
  const passwordHash = await hashPassword("kuula-admin-2026");
  await query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, password_hash, kyc_status)
     VALUES ($1, 'admin', 'Admin Kavuma', 'AK', '+256700000001', $2, 'ADMIN-ID', 'January 1, 1990', 'Kampala', 'Kuula Staff', 'January 2020', TRUE, $3, 'verified')
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN_ID, "admin@kuula.ug", passwordHash],
  );

  const pinHash = await hashPin("1234");
  await query(
    `INSERT INTO users (id, role, full_name, initials, phone, email, national_id, date_of_birth, district, occupation, member_since, verified, pin_hash, kyc_status, kyc_verified_at)
     VALUES ($1, 'user', 'Amara Nakato', 'AN', '+256770123456', 'amara.nakato@gmail.com', 'CM86H00P12PL', 'March 15, 1992', 'Kampala', 'Small Business Owner', 'January 2024', TRUE, $2, 'verified', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID, pinHash],
  );

  await query(
    `INSERT INTO credit_inputs (user_id, momo_months, momo_txn_count, crb_status, crb_score, avg_monthly_balance, kyc_verified)
     VALUES ($1, 18, 240, 'clean', 820, 75000, TRUE)
     ON CONFLICT (user_id) DO NOTHING`,
    [USER_ID],
  );

  await query(
    `INSERT INTO savings_accounts (user_id, balance, interest_apr) VALUES ($1, 340000, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [USER_ID, COMPLIANCE.SAVINGS_APR],
  );

  await query(
    `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [USER_ID],
  );

  await query(
    `INSERT INTO messages (id, sender_id, receiver_id, content, is_read, created_at) VALUES
      ('MSG-SEED-001', $1, $2, 'Hello, I have a question about my loan payment.', TRUE, NOW() - INTERVAL '2 hours'),
      ('MSG-SEED-002', $2, $1, 'Hi Amara! Of course — what would you like to know?', TRUE, NOW() - INTERVAL '2 hours'),
      ('MSG-SEED-003', $1, $2, 'When is my next payment due?', FALSE, NOW() - INTERVAL '1 hour')
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID, ADMIN_ID],
  );

  const score = computeCreditScore({
    momoMonths: 18, momoTxnCount: 240, crbStatus: "clean",
    savingsBalance: 340000, kycVerified: true, loansRepaid: 8, loansTotal: 8,
  });
  await query(
    `INSERT INTO credit_score_history (user_id, score, max_score, tier, percentile, factors) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [USER_ID, score.score, score.maxScore, score.tier, score.percentile, JSON.stringify(score.factors)],
  );

  logger.info("test seed complete");
}
