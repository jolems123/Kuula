-- Kuula credit operations workflow: field evaluation, evidence, staged review, discussion, and audit.

CREATE TABLE "credit_cases" (
  "application_id" UUID PRIMARY KEY REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "customer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "current_level" INTEGER NOT NULL DEFAULT 1 CHECK ("current_level" BETWEEN 1 AND 3),
  "status" TEXT NOT NULL DEFAULT 'field_evaluation',
  "current_assignee_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);
CREATE INDEX "credit_cases_queue_idx" ON "credit_cases"("current_level", "status", "current_assignee_id");
CREATE INDEX "credit_cases_customer_idx" ON "credit_cases"("customer_id", "updated_at" DESC);

CREATE TABLE "credit_evaluations" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "officer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "business_name" TEXT,
  "business_type" TEXT,
  "business_location" TEXT,
  "years_operating" NUMERIC(8,2),
  "employee_count" INTEGER,
  "estimated_monthly_sales" BIGINT,
  "estimated_stock_value" BIGINT,
  "monthly_operating_expenses" BIGINT,
  "existing_business_debt" BIGINT,
  "business_observations" TEXT,
  "financial_observations" TEXT,
  "character_assessment" TEXT,
  "repayment_capacity" TEXT,
  "risks" TEXT,
  "mitigating_factors" TEXT,
  "purpose_assessment" TEXT,
  "recommendation" TEXT,
  "recommended_amount" BIGINT,
  "recommended_term_days" INTEGER,
  "gps_latitude" NUMERIC(10,7),
  "gps_longitude" NUMERIC(10,7),
  "visit_started_at" TIMESTAMP(3),
  "visit_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMP(3),
  UNIQUE ("application_id", "version")
);
CREATE INDEX "credit_evaluations_application_idx" ON "credit_evaluations"("application_id", "created_at" DESC);
CREATE INDEX "credit_evaluations_officer_idx" ON "credit_evaluations"("officer_id", "status", "updated_at" DESC);

CREATE TABLE "evaluation_evidence" (
  "id" UUID PRIMARY KEY,
  "evaluation_id" UUID NOT NULL REFERENCES "credit_evaluations"("id") ON DELETE CASCADE,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "uploaded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "evidence_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL UNIQUE,
  "mime" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "gps_latitude" NUMERIC(10,7),
  "gps_longitude" NUMERIC(10,7),
  "captured_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "evaluation_evidence_application_idx" ON "evaluation_evidence"("application_id", "created_at");
CREATE INDEX "evaluation_evidence_evaluation_idx" ON "evaluation_evidence"("evaluation_id", "created_at");

CREATE TABLE "approval_assignments" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "level" INTEGER NOT NULL CHECK ("level" BETWEEN 1 AND 3),
  "assignee_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "approval_assignments_one_active_level_idx"
  ON "approval_assignments"("application_id", "level") WHERE "status" = 'active';
CREATE INDEX "approval_assignments_queue_idx" ON "approval_assignments"("assignee_id", "status", "level", "assigned_at");

CREATE TABLE "approval_actions" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "level" INTEGER NOT NULL CHECK ("level" BETWEEN 1 AND 3),
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "narrative" TEXT NOT NULL,
  "recommended_amount" BIGINT,
  "recommended_term_days" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "approval_actions_application_idx" ON "approval_actions"("application_id", "created_at");
CREATE INDEX "approval_actions_actor_idx" ON "approval_actions"("actor_id", "created_at" DESC);

CREATE TABLE "application_messages" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "recipient_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "message_type" TEXT NOT NULL DEFAULT 'internal',
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at" TIMESTAMP(3)
);
CREATE INDEX "application_messages_thread_idx" ON "application_messages"("application_id", "created_at");
CREATE INDEX "application_messages_recipient_idx" ON "application_messages"("recipient_id", "created_at" DESC);

CREATE TABLE "credit_operation_events" (
  "id" UUID PRIMARY KEY,
  "application_id" UUID NOT NULL REFERENCES "loan_applications"("id") ON DELETE CASCADE,
  "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "from_level" INTEGER,
  "to_level" INTEGER,
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "credit_operation_events_application_idx" ON "credit_operation_events"("application_id", "created_at");
