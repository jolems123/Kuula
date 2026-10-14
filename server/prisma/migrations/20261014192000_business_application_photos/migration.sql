CREATE TABLE IF NOT EXISTS business_application_photos (
  id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  photo_type TEXT NOT NULL CHECK (photo_type IN ('exterior','interior','stock_equipment','applicant_at_business')),
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 32 AND 5242880),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, photo_type)
);
CREATE INDEX IF NOT EXISTS business_application_photos_upload_idx ON business_application_photos(uploaded_by, created_at);
