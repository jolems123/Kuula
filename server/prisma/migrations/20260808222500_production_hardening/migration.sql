-- Kuula production hardening: identity, sessions, underwriting, KYC audit, and reconciliation.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "national_id" IS NOT NULL
    GROUP BY "national_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique NIN: duplicate national_id values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_national_id_key" ON "users"("national_id");

ALTER TABLE "loan_applications"
  ADD COLUMN IF NOT EXISTS "offer_expires_at" TIMESTAMP(3);

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "provider_amount" BIGINT,
  ADD COLUMN IF NOT EXISTS "provider_currency" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliation_status" TEXT NOT NULL DEFAULT 'unreconciled',
  ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "credit_evidence" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source_type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_reference" TEXT NOT NULL,
  "momo_months" INTEGER,
  "momo_txn_count" INTEGER,
  "crb_status" TEXT,
  "payload" JSONB,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'verified',
  "verified_by" UUID,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_evidence_provider_external_reference_key" ON "credit_evidence"("provider", "external_reference");
CREATE INDEX IF NOT EXISTS "credit_evidence_user_id_source_type_status_expires_at_idx" ON "credit_evidence"("user_id", "source_type", "status", "expires_at");
ALTER TABLE "credit_evidence" ADD CONSTRAINT "credit_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "kyc_submissions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "full_name" TEXT NOT NULL,
  "national_id" TEXT NOT NULL,
  "date_of_birth" TIMESTAMP(3) NOT NULL,
  "front_ref" TEXT NOT NULL,
  "back_ref" TEXT NOT NULL,
  "front_mime" TEXT NOT NULL,
  "back_mime" TEXT NOT NULL,
  "provider" TEXT,
  "provider_reference" TEXT,
  "provider_status" TEXT,
  "provider_detail" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by" UUID,
  "decision_reason" TEXT,
  CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kyc_submissions_user_id_version_key" ON "kyc_submissions"("user_id", "version");
CREATE INDEX IF NOT EXISTS "kyc_submissions_status_submitted_at_idx" ON "kyc_submissions"("status", "submitted_at");
CREATE INDEX IF NOT EXISTS "kyc_submissions_national_id_idx" ON "kyc_submissions"("national_id");
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "kyc_audit_events" (
  "id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "actor_id" UUID,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "kyc_audit_events_submission_id_created_at_idx" ON "kyc_audit_events"("submission_id", "created_at");
CREATE INDEX IF NOT EXISTS "kyc_audit_events_actor_id_created_at_idx" ON "kyc_audit_events"("actor_id", "created_at");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" UUID NOT NULL,
  "actor_id" UUID,
  "subject_user_id" UUID,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- The recovered 20260729120000 migration created an earlier audit_events
-- shape. Preserve its rows while upgrading it to the current application
-- contract, and leave the legacy columns nullable for rollback compatibility.
ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "subject_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "resource_type" TEXT,
  ADD COLUMN IF NOT EXISTS "resource_id" TEXT;
UPDATE "audit_events"
SET "resource_type" = COALESCE("resource_type", "entity_type"),
    "resource_id" = COALESCE("resource_id", "entity_id")
WHERE "resource_type" IS NULL OR "resource_id" IS NULL;
ALTER TABLE "audit_events" ALTER COLUMN "resource_type" SET NOT NULL;
ALTER TABLE "audit_events" ALTER COLUMN "entity_type" DROP NOT NULL;
ALTER TABLE "audit_events" ALTER COLUMN "entity_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_subject_user_id_created_at_idx" ON "audit_events"("subject_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_resource_type_resource_id_idx" ON "audit_events"("resource_type", "resource_id");

CREATE TABLE IF NOT EXISTS "underwriting_assessments" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "declared_monthly_income" BIGINT NOT NULL,
  "declared_monthly_expenses" BIGINT NOT NULL,
  "existing_debt_payment" BIGINT NOT NULL DEFAULT 0,
  "verified_monthly_income" BIGINT,
  "disposable_income" BIGINT NOT NULL,
  "max_affordable_payment" BIGINT NOT NULL,
  "credit_score" INTEGER NOT NULL,
  "approved_limit" BIGINT NOT NULL,
  "status" TEXT NOT NULL,
  "flags" JSONB NOT NULL DEFAULT '[]',
  "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assessed_by" UUID,
  CONSTRAINT "underwriting_assessments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "underwriting_assessments_application_id_key" ON "underwriting_assessments"("application_id");
CREATE INDEX IF NOT EXISTS "underwriting_assessments_user_id_assessed_at_idx" ON "underwriting_assessments"("user_id", "assessed_at");
CREATE INDEX IF NOT EXISTS "underwriting_assessments_status_idx" ON "underwriting_assessments"("status");
ALTER TABLE "underwriting_assessments" ADD CONSTRAINT "underwriting_assessments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "underwriting_assessments" ADD CONSTRAINT "underwriting_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "loan_agreement_acceptances" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "agreement_version" TEXT NOT NULL,
  "agreement_hash" TEXT NOT NULL,
  "terms_snapshot" JSONB NOT NULL,
  "client_context" JSONB,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_agreement_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "loan_agreement_acceptances_application_id_key" ON "loan_agreement_acceptances"("application_id");
CREATE INDEX IF NOT EXISTS "loan_agreement_acceptances_user_id_accepted_at_idx" ON "loan_agreement_acceptances"("user_id", "accepted_at");
ALTER TABLE "loan_agreement_acceptances" ADD CONSTRAINT "loan_agreement_acceptances_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_agreement_acceptances" ADD CONSTRAINT "loan_agreement_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "loan_applications_offer_expires_at_idx" ON "loan_applications"("offer_expires_at");
CREATE INDEX IF NOT EXISTS "repayments_user_id_status_due_date_idx" ON "repayments"("user_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "transactions_status_created_at_idx" ON "transactions"("status", "created_at");
CREATE INDEX IF NOT EXISTS "transactions_reconciliation_status_created_at_idx" ON "transactions"("reconciliation_status", "created_at");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "loan_applications"
    WHERE "status" IN ('pending', 'resubmitted', 'offered', 'disbursing', 'active', 'overdue')
    GROUP BY "applicant_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one open loan/application per customer: duplicate open records exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "loan_applications_one_open_per_customer"
  ON "loan_applications"("applicant_id")
  WHERE "status" IN ('pending', 'resubmitted', 'offered', 'disbursing', 'active', 'overdue');
