CREATE OR REPLACE FUNCTION kuula_require_staged_credit_decision()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'offered' AND OLD.status IS DISTINCT FROM 'offered' THEN
    IF NOT EXISTS (
      SELECT 1 FROM credit_cases c
      WHERE c.application_id = NEW.id AND c.status = 'ready_for_offer'
    ) OR NOT EXISTS (
      SELECT 1 FROM approval_actions a
      WHERE a.application_id = NEW.id AND a.level = 3 AND a.action = 'approve'
    ) THEN
      RAISE EXCEPTION 'STAGED_CREDIT_APPROVAL_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    IF NOT EXISTS (
      SELECT 1 FROM credit_cases c
      WHERE c.application_id = NEW.id AND c.status = 'rejected'
    ) OR NOT EXISTS (
      SELECT 1 FROM approval_actions a
      WHERE a.application_id = NEW.id AND a.action = 'reject'
    ) THEN
      RAISE EXCEPTION 'STAGED_CREDIT_REJECTION_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_staged_credit_decision ON loan_applications;
CREATE TRIGGER enforce_staged_credit_decision
BEFORE UPDATE OF status ON loan_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION kuula_require_staged_credit_decision();
