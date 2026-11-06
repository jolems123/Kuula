-- Existing transactions and batches retain lender-paid provider fees.
ALTER TABLE transactions ADD COLUMN customer_fee BIGINT NOT NULL DEFAULT 0 CHECK (customer_fee >= 0);
ALTER TABLE disbursement_legs ADD COLUMN customer_fee BIGINT NOT NULL DEFAULT 0 CHECK (customer_fee >= 0);
-- Earlier batch constraints assumed net payout always equals principal.

DO $$ DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='disbursement_batches'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) = 'CHECK ((total_planned = approved_amount))'
  LOOP EXECUTE format('ALTER TABLE disbursement_batches DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE disbursement_batches ADD CONSTRAINT disbursement_net_within_principal CHECK (total_planned > 0 AND total_planned <= approved_amount);

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
  v_existing_due_at timestamptz;
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

  SELECT COALESCE(SUM(amount + customer_fee) FILTER (WHERE status = 'settled'), 0)::bigint
    INTO v_settled_amount
  FROM disbursement_legs
  WHERE batch_id = NEW.batch_id;

  v_obligation := CEIL((v_contract_total::numeric * v_settled_amount::numeric) / v_approved_amount::numeric)::bigint;
  v_due_at := CURRENT_TIMESTAMP + make_interval(days => v_term_days);

  SELECT id, amount_paid, due_date
    INTO v_repayment_id, v_amount_paid, v_existing_due_at
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
           due_date = COALESCE(v_existing_due_at, due_date, v_due_at),
           status = CASE
             WHEN COALESCE(v_amount_paid, 0) >= v_obligation THEN 'paid'
             WHEN status = 'paid' THEN 'scheduled'
             ELSE status
           END
     WHERE id = v_repayment_id;
  END IF;

  RETURN NEW;
END;
$$;

