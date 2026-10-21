CREATE TABLE "loan_guarantor_requirements" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_required',
  "reason" TEXT,
  "requested_by" UUID,
  "requested_at" TIMESTAMP(3),
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "evidence_reference" TEXT,
  "agreement_reference" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_guarantor_requirements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_guarantor_requirements_application_id_key" ON "loan_guarantor_requirements"("application_id");
CREATE INDEX "loan_guarantor_requirements_status_idx" ON "loan_guarantor_requirements"("status");
ALTER TABLE "loan_guarantor_requirements" ADD CONSTRAINT "loan_guarantor_requirements_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
