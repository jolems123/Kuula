CREATE TABLE "support_tickets" (
  "id" UUID PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_to" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ,
  CONSTRAINT "support_tickets_category_check" CHECK (category IN ('general','account','kyc','loan','repayment','technical')),
  CONSTRAINT "support_tickets_priority_check" CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT "support_tickets_status_check" CHECK (status IN ('open','in_progress','closed'))
);
CREATE INDEX "support_tickets_status_updated_idx" ON "support_tickets"("status", "updated_at" DESC);
CREATE INDEX "support_tickets_customer_idx" ON "support_tickets"("customer_id", "updated_at" DESC);

ALTER TABLE "messages" ADD COLUMN "ticket_id" UUID REFERENCES "support_tickets"("id") ON DELETE RESTRICT;
CREATE INDEX "messages_ticket_created_idx" ON "messages"("ticket_id", "created_at");

CREATE TABLE "collection_activities" (
  "id" UUID PRIMARY KEY,
  "repayment_id" UUID NOT NULL REFERENCES "repayments"("id") ON DELETE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_to" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "activity_type" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "promise_amount" BIGINT,
  "promise_date" TIMESTAMPTZ,
  "promise_status" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_activity_type_check" CHECK (activity_type IN ('note','contact','assignment','promise_to_pay','promise_update')),
  CONSTRAINT "collection_promise_status_check" CHECK (promise_status IS NULL OR promise_status IN ('pending','kept','broken','cancelled'))
);
CREATE INDEX "collection_activities_repayment_idx" ON "collection_activities"("repayment_id", "created_at" DESC);
