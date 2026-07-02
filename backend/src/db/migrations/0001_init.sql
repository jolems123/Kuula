-- ────────────────────────────────────────────────────────────────────────────
-- Kuula Mobile — initial schema
--
-- All money values are stored as BIGINT cents (UGX has no fractional unit but
-- we use cents to be portable). All timestamps are TIMESTAMPTZ stored as UTC.
-- All IDs are TEXT (we use human-readable prefixed IDs like KUU-2026-000123
-- alongside a uuid BIGSERIAL where helpful for FKs).
-- ────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    full_name       TEXT NOT NULL,
    initials        TEXT NOT NULL DEFAULT '',
    phone           TEXT NOT NULL UNIQUE,
    email           CITEXT UNIQUE,
    national_id     TEXT,
    date_of_birth   TEXT,
    district        TEXT NOT NULL DEFAULT '',
    occupation      TEXT NOT NULL DEFAULT '',
    member_since    TEXT NOT NULL DEFAULT '',
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url      TEXT,
    pin_hash        TEXT,                    -- argon2 hash of customer PIN
    password_hash   TEXT,                    -- argon2 hash of admin/staff password
    kyc_status      TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (kyc_status IN ('unverified','pending','verified','rejected')),
    kyc_submitted_at TIMESTAMPTZ,
    kyc_verified_at TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_at      TIMESTAMPTZ,             -- soft delete; account-deletion flow
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone) WHERE deleted_at IS NULL;

-- ── refresh_tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,    -- sha256 of the refresh JWT
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,             -- explicit logout or rotation
    user_agent      TEXT,
    ip              INET
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens(token_hash);

-- ── otp_codes (short-lived, hashed) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
    id              BIGSERIAL PRIMARY KEY,
    key             TEXT NOT NULL,           -- phone or email
    code_hash       TEXT NOT NULL,           -- argon2 hash of the 6-digit code
    purpose         TEXT NOT NULL,           -- signup | login | reset
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    attempts        INT NOT NULL DEFAULT 0,  -- bump on each wrong verify
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_codes_key_idx ON otp_codes(key);

-- ── credit_inputs (per-user scoring inputs) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_inputs (
    user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    momo_months         INT NOT NULL DEFAULT 0,
    momo_txn_count      INT NOT NULL DEFAULT 0,
    crb_status          TEXT NOT NULL DEFAULT 'thin'
                        CHECK (crb_status IN ('clean','thin','adverse','unknown')),
    crb_score           INT,                 -- 0..1000
    avg_monthly_balance BIGINT NOT NULL DEFAULT 0,
    kyc_verified        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── credit_score_history (snapshots of computed scores) ─────────────────────
CREATE TABLE IF NOT EXISTS credit_score_history (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score           INT NOT NULL,
    max_score       INT NOT NULL,
    tier            TEXT NOT NULL,
    percentile      INT NOT NULL,
    factors         JSONB NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_score_history_user_idx ON credit_score_history(user_id, computed_at DESC);

-- ── savings_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS savings_accounts (
    user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance             BIGINT NOT NULL DEFAULT 0,    -- cents
    accrued_interest    BIGINT NOT NULL DEFAULT 0,    -- cents, since last touch
    interest_apr        NUMERIC(6,4) NOT NULL DEFAULT 0.05,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── savings_goals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS savings_goals (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    target          BIGINT NOT NULL,
    saved           BIGINT NOT NULL DEFAULT 0,
    deadline        TEXT,
    emoji           TEXT NOT NULL DEFAULT '🎯',
    archived        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS savings_goals_user_idx ON savings_goals(user_id) WHERE archived = FALSE;

-- ── wallets (mobile-money wallet balance held by Kuula on behalf of user) ───
CREATE TABLE IF NOT EXISTS wallets (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance         BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── loan_applications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_applications (
    id                  TEXT PRIMARY KEY,
    applicant_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    applicant_name      TEXT NOT NULL,
    amount              BIGINT NOT NULL,
    purpose             TEXT NOT NULL,
    term_days           INT NOT NULL,
    channel             TEXT NOT NULL,           -- mtn_momo | airtel_money | bank
    pricing             JSONB NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','active','failed','paid','closed')),
    approved_by         TEXT,                    -- admin user id or 'auto-approve'
    decided_at          TIMESTAMPTZ,
    decision_notes      TEXT,
    loan_id             TEXT,                    -- set on approval
    disbursement_id     TEXT,                    -- set on approval
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS loan_applications_applicant_idx ON loan_applications(applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loan_applications_status_idx ON loan_applications(status, created_at DESC);

-- ── loans (approved applications become loans) ──────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
    id                  TEXT PRIMARY KEY,        -- LN-...
    application_id      TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount              BIGINT NOT NULL,
    term_days           INT NOT NULL,
    interest_rate       NUMERIC(6,4) NOT NULL,
    service_fee_rate    NUMERIC(6,4) NOT NULL DEFAULT 0.10,
    interest            BIGINT NOT NULL,
    service_fee         BIGINT NOT NULL,
    total               BIGINT NOT NULL,
    apr                 NUMERIC(6,4) NOT NULL,
    apr_clamped         BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paid','overdue','defaulted','written_off')),
    disbursed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date            TIMESTAMPTZ NOT NULL,
    paid_at             TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS loans_user_idx ON loans(user_id, disbursed_at DESC);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans(status, due_date);

-- ── repayments (one per loan) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repayments (
    loan_id             TEXT PRIMARY KEY REFERENCES loans(id) ON DELETE CASCADE,
    total               BIGINT NOT NULL,
    amount_paid         BIGINT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','paid','overdue')),
    auto_pay_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    due_date            TIMESTAMPTZ NOT NULL,
    paid_at             TIMESTAMPTZ,
    receipt             JSONB
);

-- ── repayment_attempts (audit of auto-collection tries) ────────────────────
CREATE TABLE IF NOT EXISTS repayment_attempts (
    id              BIGSERIAL PRIMARY KEY,
    loan_id         TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    method          TEXT NOT NULL,
    amount          BIGINT NOT NULL,
    success         BOOLEAN NOT NULL,
    reason          TEXT NOT NULL,
    provider_ref    TEXT
);
CREATE INDEX IF NOT EXISTS repayment_attempts_loan_idx ON repayment_attempts(loan_id, attempted_at DESC);

-- ── disbursements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disbursements (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          BIGINT NOT NULL,
    channel         TEXT NOT NULL,
    msisdn          TEXT NOT NULL,
    provider_ref    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','completed','failed')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS disbursements_user_idx ON disbursements(user_id, requested_at DESC);

-- ── transactions (ledger: append-only) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    loan_id         TEXT,
    type            TEXT NOT NULL,           -- loan_disbursement | loan_payment | savings_deposit | savings_withdrawal | wallet_topup
    amount          BIGINT NOT NULL,
    status          TEXT NOT NULL,           -- pending | completed | failed
    transaction_id  TEXT,                    -- provider reference
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_loan_idx ON transactions(loan_id) WHERE loan_id IS NOT NULL;

-- ── messages (support chat: customer <-> admin) ─────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON messages(receiver_id, is_read, created_at DESC);

-- ── notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'info',  -- info | success | warning | error
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

-- ── audit_log (append-only, every admin action) ─────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        TEXT,                    -- nullable: system actions have no actor
    action          TEXT NOT NULL,
    target_type     TEXT,
    target_id       TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log(target_type, target_id);

-- ── updated_at triggers (auto-stamp every UPDATE) ───────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON users;        CREATE TRIGGER users_touch        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS credit_inputs_touch ON credit_inputs; CREATE TRIGGER credit_inputs_touch BEFORE UPDATE ON credit_inputs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS savings_accounts_touch ON savings_accounts; CREATE TRIGGER savings_accounts_touch BEFORE UPDATE ON savings_accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS savings_goals_touch ON savings_goals; CREATE TRIGGER savings_goals_touch BEFORE UPDATE ON savings_goals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS wallets_touch ON wallets; CREATE TRIGGER wallets_touch BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS loan_applications_touch ON loan_applications; CREATE TRIGGER loan_applications_touch BEFORE UPDATE ON loan_applications FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS loans_touch ON loans; CREATE TRIGGER loans_touch BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
