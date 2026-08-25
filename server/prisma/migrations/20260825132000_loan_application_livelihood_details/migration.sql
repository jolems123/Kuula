CREATE TABLE "loan_application_details" (
  "application_id" UUID NOT NULL,
  "employment_status" TEXT NOT NULL,
  "occupation_or_business" TEXT NOT NULL,
  "employer_or_business_name" TEXT,
  "work_duration" TEXT NOT NULL,
  "income_source" TEXT NOT NULL,
  "repayment_source" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_application_details_pkey" PRIMARY KEY ("application_id"),
  CONSTRAINT "loan_application_details_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "loan_application_details_employment_status_idx"
  ON "loan_application_details"("employment_status");
CREATE INDEX "loan_application_details_income_source_idx"
  ON "loan_application_details"("income_source");
