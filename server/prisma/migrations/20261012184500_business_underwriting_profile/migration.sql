-- Existing loans retain not_required; only new applications require business verification.
ALTER TABLE "loan_applications"
 ADD COLUMN "business_profile" JSONB,
 ADD COLUMN "business_review_status" TEXT NOT NULL DEFAULT 'not_required',
 ADD COLUMN "business_reviewed_at" TIMESTAMP(3),
 ADD COLUMN "business_reviewed_by" UUID,
 ADD COLUMN "business_review_notes" TEXT;
CREATE INDEX "loan_applications_business_review_status_idx" ON "loan_applications"("business_review_status");
