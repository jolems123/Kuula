CREATE TABLE payment_provider_limits (
  id uuid PRIMARY KEY,
  market_code text NOT NULL,
  provider text NOT NULL,
  network text NOT NULL,
  beneficiary_type text NOT NULL DEFAULT 'customer',
  min_amount bigint NOT NULL DEFAULT 500,
  max_single_amount bigint NOT NULL,
  max_daily_amount bigint,
  enabled boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to timestamptz,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (beneficiary_type IN ('customer','partner')),
  CHECK (min_amount > 0),
  CHECK (max_single_amount >= min_amount),
  CHECK (max_daily_amount IS NULL OR max_daily_amount >= max_single_amount)
);

CREATE UNIQUE INDEX payment_provider_limits_active_unique
ON payment_provider_limits (market_code, provider, network, beneficiary_type)
WHERE enabled = true AND effective_to IS NULL;

CREATE INDEX payment_provider_limits_lookup_idx
ON payment_provider_limits (market_code, provider, network, beneficiary_type, enabled, effective_from);

CREATE TABLE disbursement_batches (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  loan_id text NOT NULL,
  beneficiary_type text NOT NULL,
  beneficiary_reference text NOT NULL,
  market_code text NOT NULL DEFAULT 'UG',
  provider text NOT NULL,
  network text NOT NULL,
  currency text NOT NULL DEFAULT 'UGX',
  approved_amount bigint NOT NULL,
  total_planned bigint NOT NULL,
  total_settled bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  CHECK (beneficiary_type IN ('customer','partner')),
  CHECK (approved_amount > 0),
  CHECK (total_planned = approved_amount),
  CHECK (total_settled >= 0 AND total_settled <= total_planned),
  CHECK (status IN ('planned','processing','partially_disbursed','settled','failed','attention_required'))
);

CREATE INDEX disbursement_batches_status_idx
ON disbursement_batches (status, updated_at);
CREATE INDEX disbursement_batches_user_idx
ON disbursement_batches (user_id, created_at DESC);

CREATE TABLE disbursement_legs (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES disbursement_batches(id) ON DELETE RESTRICT,
  sequence integer NOT NULL,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  transaction_id uuid UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  reference text UNIQUE,
  provider_transaction_id text,
  provider_status text,
  failure_reason text,
  attempted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (sequence > 0),
  CHECK (amount > 0),
  CHECK (status IN ('planned','dispatching','pending','settled','failed','attention_required')),
  UNIQUE (batch_id, sequence)
);

CREATE INDEX disbursement_legs_batch_status_idx
ON disbursement_legs (batch_id, status, sequence);
CREATE INDEX disbursement_legs_reference_idx
ON disbursement_legs (reference);

CREATE OR REPLACE FUNCTION kuula_disbursement_batch_total_guard()
RETURNS trigger AS $$
DECLARE
  planned_sum bigint;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO planned_sum FROM disbursement_legs WHERE batch_id = NEW.batch_id;
  IF TG_OP = 'INSERT' THEN planned_sum := planned_sum + NEW.amount; END IF;
  IF planned_sum > (SELECT approved_amount FROM disbursement_batches WHERE id = NEW.batch_id) THEN
    RAISE EXCEPTION 'DISBURSEMENT_LEGS_EXCEED_APPROVED_AMOUNT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_disbursement_leg_total ON disbursement_legs;
CREATE TRIGGER guard_disbursement_leg_total
BEFORE INSERT OR UPDATE OF amount ON disbursement_legs
FOR EACH ROW EXECUTE FUNCTION kuula_disbursement_batch_total_guard();
