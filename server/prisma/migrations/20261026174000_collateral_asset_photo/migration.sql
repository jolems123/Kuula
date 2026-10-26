-- Distinguish actual pledged collateral photographs from ordinary business inventory.
ALTER TABLE business_application_photos
  DROP CONSTRAINT IF EXISTS business_application_photos_photo_type_check;
ALTER TABLE business_application_photos
  ADD CONSTRAINT business_application_photos_photo_type_check
  CHECK (photo_type IN ('exterior', 'interior', 'stock_equipment', 'applicant_at_business', 'collateral_asset'));
