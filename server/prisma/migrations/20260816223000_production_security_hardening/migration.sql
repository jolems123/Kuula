-- Production security hardening: webhook replay protection, partial-disbursement
-- servicing, and tamper-evident operational audit trails.

CREATE TABLE IF NOT EXISTS webhook_receipts (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_receipts_received_at_idx ON webhook_receipts (received_at);

-- A settled tranche is already real money and therefore must immediately have
-- a servicing obligation. The repayment grows proportionally as later tranches
-- settle. When the final leg settles the obligation equals the contractual
-- total repayment. The due date begins from the first settled tranche.
CREATE OR REPLACE FUNCTION ensure_partial_disbursement_repayment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_application_id uuid;
  v_user_id uuid;
  v_loan_id text;
  v_approved_amount bigint;
  v_settled_amount bigint;
  v_contract_total bigint;
  v_term_days integer;
  v_obligation bigint;
  v_due_at timestamptz;
  v_repayment_id uuid;
  v_amount_paid bigint;
BEGIN
  IF NEW.status <> 'settled' OR OLD.status = 'settled' THEN
    RETURN NEW;
  END IF;

  SELECT b.application_id, b.user_id, b.loan_id, b.approved_amount,
         a.total, a.term_days
    INTO v_application_id, v_user_id, v_loan_id, v_approved_amount,
         v_contract_total, v_term_days
  FROM disbursement_batches b
  JOIN loan_applications a ON a.id = b.application_id
  WHERE b.id = NEW.batch_id
  FOR UPDATE;

  IF v_application_id IS NULL OR v_approved_amount <= 0 THEN
    RAISE EXCEPTION 'Disbursement batch is not linked to a valid application';
  END IF;

  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'settled'), 0)::bigint
    INTO v_settled_amount
  FROM disbursement_legs
  WHERE batch_id = NEW.batch_id;

  v_obligation := CEIL((v_contract_total::numeric * v_settled_amount::numeric) / v_approved_amount::numeric)::bigint;
  v_due_at := CURRENT_TIMESTAMP + make_interval(days => v_term_days);

  SELECT id, amount_paid, due_date
    INTO v_repayment_id, v_amount_paid, v_due_at
  FROM repayments
  WHERE user_id = v_user_id AND loan_id = v_loan_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_repayment_id IS NULL THEN
    INSERT INTO repayments (id, loan_id, user_id, total, amount_paid, due_date, status, attempts, created_at)
    VALUES (gen_random_uuid(), v_loan_id, v_user_id, v_obligation, 0, v_due_at, 'scheduled', '[]'::jsonb, CURRENT_TIMESTAMP);
  ELSE
    UPDATE repayments
       SET total = GREATEST(v_obligation, COALESCE(v_amount_paid, 0)),
           status = CASE WHEN COALESCE(v_amount_paid, 0) >= v_obligation THEN 'paid' ELSE status END
     WHERE id = v_repayment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partial_disbursement_repayment ON disbursement_legs;
CREATE TRIGGER trg_partial_disbursement_repayment
AFTER UPDATE OF status ON disbursement_legs
FOR EACH ROW
EXECUTE FUNCTION ensure_partial_disbursement_repayment();

-- Security audit/event rows are append-only. Application code may insert them
-- but cannot silently rewrite operational history later.
CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

DROP TRIGGER IF EXISTS trg_kyc_audit_events_immutable ON kyc_audit_events;
CREATE TRIGGER trg_kyc_audit_events_immutable
BEFORE UPDATE OR DELETE ON kyc_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

DROP TRIGGER IF EXISTS trg_credit_operation_events_immutable ON credit_operation_events;
CREATE TRIGGER trg_credit_operation_events_immutable
BEFORE UPDATE OR DELETE ON credit_operation_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
