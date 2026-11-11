-- Human-readable, unique and stable agreement references for all loan applications.
-- The internal UUID stays the primary key. Existing accepted terms/hashes are untouched.
CREATE SEQUENCE IF NOT EXISTS kuula_agreement_reference_seq AS bigint START WITH 1 INCREMENT BY 1;

ALTER TABLE loan_applications
  ADD COLUMN IF NOT EXISTS agreement_number text;

ALTER TABLE loan_applications
  ALTER COLUMN agreement_number
  SET DEFAULT (
    'KUL-' || EXTRACT(YEAR FROM CURRENT_DATE)::integer::text || '-' ||
    LPAD(nextval('kuula_agreement_reference_seq')::text, 6, '0')
  );

-- Deterministic assignment order for legacy loans; once assigned it never changes.
WITH legacy AS (
  SELECT id FROM loan_applications WHERE agreement_number IS NULL
  ORDER BY created_at ASC, id ASC
)
UPDATE loan_applications AS applications
SET agreement_number = (
  'KUL-' || EXTRACT(YEAR FROM applications.created_at)::integer::text || '-' ||
  LPAD(nextval('kuula_agreement_reference_seq')::text, 6, '0')
)
WHERE applications.id IN (SELECT id FROM legacy);

ALTER TABLE loan_applications ALTER COLUMN agreement_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loan_applications_agreement_number_key
  ON loan_applications (agreement_number);
