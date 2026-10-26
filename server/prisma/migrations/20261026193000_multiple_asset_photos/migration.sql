-- Preserve one mandatory view per type; permit separate stock/collateral views.
ALTER TABLE business_application_photos DROP CONSTRAINT IF EXISTS business_application_photos_application_id_photo_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS business_application_photos_required_unique
  ON business_application_photos(application_id, photo_type)
  WHERE photo_type IN ('exterior','interior','applicant_at_business');
CREATE INDEX IF NOT EXISTS business_application_photos_case_kind_idx
  ON business_application_photos(application_id, photo_type, created_at);
