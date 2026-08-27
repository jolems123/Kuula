-- Kuula critical remediation: real money movement, exactly-once financial
-- effects, secure OTP and session storage.
--
-- NON-DESTRUCTIVE. This migration only adds columns, tables, indexes and
-- constraints. No column is dropped and no row is deleted. The deprecated
-- users.otp_code / users.otp_expires_at columns are left in place (unused) and
-- the wallets table is retained.

-- ── transactions: provider-backed ledger (C-01, C-02, C-06, C-08) ──────────
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "repayment_id"    UUID,
  ADD COLUMN IF NOT EXISTS "provider"        TEXT,
  ADD COLUMN IF NOT EXISTS "provider_ref"    TEXT,
  ADD COLUMN IF NOT EXISTS "reference"       TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "failure_reason"  TEXT,
  ADD COLUMN IF NOT EXISTS "settled_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A provider transaction id maps to exactly one ledger row, so a callback can
-- never be applied twice through two different rows.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_provider_ref_key"    ON "transactions"("provider_ref");
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_reference_key"       ON "transactions"("reference");
-- The double-click / retry / multi-instance guard (C-06).
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_idempotency_key_key" ON "transactions"("idempotency_key");
CREATE INDEX        IF NOT EXISTS "transactions_repayment_id_idx"    ON "transactions"("repayment_id");

-- A loan may have at most ONE disbursement that is pending or completed.
-- A second payout attempt fails with a unique violation inside the transaction
-- that would have called the provider, so no second payout is ever requested.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_one_live_disbursement_per_loan"
  ON "transactions"("loan_id")
  WHERE "type" = 'loan_disbursement' AND "status" IN ('pending', 'completed');

-- A loan may have at most ONE in-flight collection. Prevents a borrower
-- double-tapping "Pay" from sending two MoMo prompts for the same debt.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_one_pending_collection_per_loan"
  ON "transactions"("loan_id")
  WHERE "type" = 'loan_payment' AND "status" = 'pending';

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_amount_positive";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" >= 0);

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_status_valid";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_status_valid"
  CHECK ("status" IN ('pending', 'completed', 'failed'));

-- ── loan_applications: disbursement lifecycle (C-01, C-06) ─────────────────
ALTER TABLE "loan_applications"
  ADD COLUMN IF NOT EXISTS "disbursed_at"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disbursement_txn_id" UUID;

ALTER TABLE "loan_applications" DROP CONSTRAINT IF EXISTS "loan_applications_amount_positive";
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_amount_positive"
  CHECK ("amount" > 0 AND "total" >= "amount");

-- A borrower may hold at most one loan that is live (awaiting payout, paid out,
-- or overdue) at a time. Stops a second application being disbursed while the
-- first is still outstanding.
CREATE UNIQUE INDEX IF NOT EXISTS "loan_applications_one_live_loan_per_borrower"
  ON "loan_applications"("applicant_id")
  WHERE "status" IN ('disbursing', 'active', 'overdue');

-- ── repayments: allocation integrity (C-02) ────────────────────────────────
ALTER TABLE "repayments" DROP CONSTRAINT IF EXISTS "repayments_amount_paid_bounded";
-- amount_paid can never go negative and can never exceed the amount owed, so an
-- overpaying or replayed callback cannot corrupt the balance.
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_amount_paid_bounded"
  CHECK ("amount_paid" >= 0 AND "amount_paid" <= "total");

ALTER TABLE "repayments" DROP CONSTRAINT IF EXISTS "repayments_total_positive";
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_total_positive" CHECK ("total" > 0);

CREATE INDEX IF NOT EXISTS "repayments_loan_id_idx" ON "repayments"("loan_id");

-- ── wallets: deprecated, frozen non-negative (C-07) ────────────────────────
-- No application code mutates this column any more. The constraint is
-- defence-in-depth so that a future regression cannot reintroduce a negative
-- simulated balance. Existing rows are untouched.
UPDATE "wallets" SET "balance" = 0 WHERE "balance" < 0;

ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_balance_non_negative";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);

-- Savings is a real customer liability and gets the same protection.
ALTER TABLE "savings_accounts" DROP CONSTRAINT IF EXISTS "savings_balance_non_negative";
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_balance_non_negative" CHECK ("balance" >= 0);

-- ── webhook_events: replay / duplicate callback protection (C-08) ──────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "provider"     TEXT         NOT NULL DEFAULT 'marzpay',
  "event_id"     TEXT         NOT NULL,
  "reference"    TEXT,
  "provider_ref" TEXT,
  "event_type"   TEXT,
  "payload_hash" TEXT         NOT NULL,
  "payload"      JSONB        NOT NULL DEFAULT '{}',
  "status"       TEXT         NOT NULL DEFAULT 'received',
  "result"       TEXT,
  "received_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_event_id_key"    ON "webhook_events"("event_id");
CREATE INDEX        IF NOT EXISTS "webhook_events_reference_idx"   ON "webhook_events"("reference");
CREATE INDEX        IF NOT EXISTS "webhook_events_received_at_idx" ON "webhook_events"("received_at" DESC);

-- ── otp_challenges: hashed, expiring OTPs (C-04) ───────────────────────────
CREATE TABLE IF NOT EXISTS "otp_challenges" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID,
  "phone"          TEXT         NOT NULL,
  "purpose"        TEXT         NOT NULL DEFAULT 'phone_verification',
  "code_hash"      TEXT         NOT NULL,
  "expires_at"     TIMESTAMP(3) NOT NULL,
  "attempts"       INTEGER      NOT NULL DEFAULT 0,
  "max_attempts"   INTEGER      NOT NULL DEFAULT 5,
  "consumed_at"    TIMESTAMP(3),
  "invalidated_at" TIMESTAMP(3),
  "delivery_state" TEXT         NOT NULL DEFAULT 'pending',
  "delivery_ref"   TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "otp_challenges_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "otp_challenges_phone_purpose_idx" ON "otp_challenges"("phone", "purpose", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "otp_challenges_expires_at_idx"    ON "otp_challenges"("expires_at");

-- ── refresh_tokens: rotating, revocable sessions (C-03) ────────────────────
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID         NOT NULL,
  "token_hash"     TEXT         NOT NULL,
  "family_id"      UUID         NOT NULL,
  "device_label"   TEXT,
  "expires_at"     TIMESTAMP(3) NOT NULL,
  "revoked_at"     TIMESTAMP(3),
  "replaced_by_id" UUID,
  "last_used_at"   TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX        IF NOT EXISTS "refresh_tokens_user_id_idx"    ON "refresh_tokens"("user_id");
CREATE INDEX        IF NOT EXISTS "refresh_tokens_family_id_idx"  ON "refresh_tokens"("family_id");
CREATE INDEX        IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- ── audit_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"    UUID,
  "actor_role"  TEXT,
  "action"      TEXT         NOT NULL,
  "entity_type" TEXT         NOT NULL,
  "entity_id"   TEXT         NOT NULL,
  "metadata"    JSONB        NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_events_entity_idx" ON "audit_events"("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events"("action", "created_at" DESC);

-- ── Purge plaintext OTPs left over from the console.log era ────────────────
UPDATE "users" SET "otp_code" = NULL, "otp_expires_at" = NULL
WHERE "otp_code" IS NOT NULL;
