-- Keep restricted-purpose partner requests synchronized with the canonical
-- Kuula loan application. The loan application remains the source of truth for
-- credit state; the partner request is the purpose/payee view of the same debt.
CREATE OR REPLACE FUNCTION kuula_sync_partner_financing_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE partner_financing_requests
       SET status = CASE NEW.status
         WHEN 'pending' THEN CASE WHEN status = 'payee_verified' THEN 'payee_verified' ELSE 'credit_review' END
         WHEN 'resubmitted' THEN CASE WHEN status = 'payee_verified' THEN 'payee_verified' ELSE 'credit_review' END
         WHEN 'offered' THEN 'offered'
         WHEN 'disbursing' THEN 'disbursing'
         WHEN 'active' THEN 'active'
         WHEN 'overdue' THEN 'overdue'
         WHEN 'paid' THEN 'paid'
         WHEN 'rejected' THEN 'rejected'
         ELSE status
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE loan_application_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_partner_financing_status ON loan_applications;
CREATE TRIGGER sync_partner_financing_status
AFTER UPDATE OF status ON loan_applications
FOR EACH ROW
EXECUTE FUNCTION kuula_sync_partner_financing_status();
