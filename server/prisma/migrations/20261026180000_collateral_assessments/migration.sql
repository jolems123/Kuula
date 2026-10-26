CREATE TABLE IF NOT EXISTS collateral_assessments (
 id UUID PRIMARY KEY,
 application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
 reviewed_by UUID NOT NULL REFERENCES users(id),
 asset_description TEXT NOT NULL,
 ownership_evidence TEXT NOT NULL,
 estimated_value BIGINT NOT NULL CHECK (estimated_value>=0),
 verification_status TEXT NOT NULL CHECK (verification_status IN ('pending','inspected','rejected')),
 inspection_notes TEXT NOT NULL,
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collateral_assessments_case_idx ON collateral_assessments(application_id, reviewed_at DESC);
