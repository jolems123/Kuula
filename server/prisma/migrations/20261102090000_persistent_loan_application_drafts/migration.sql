CREATE TABLE IF NOT EXISTS loan_application_drafts (
  applicant_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_application_draft_photos (
  id UUID PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('exterior','interior','applicant_at_business','stock_equipment','collateral_asset')),
  photo_order SMALLINT NOT NULL DEFAULT 0 CHECK (photo_order BETWEEN 0 AND 7),
  CHECK (photo_type NOT IN ('exterior','interior','applicant_at_business') OR photo_order = 0),
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 32 AND 5242880),
  consent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(applicant_id, photo_type, photo_order)
);
CREATE INDEX IF NOT EXISTS loan_application_draft_photos_applicant_idx ON loan_application_draft_photos(applicant_id, photo_type, photo_order);
