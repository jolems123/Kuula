-- Admin portal: manual KYC review outcome and tracked support tickets.
--
-- NON-DESTRUCTIVE. Adds columns and tables only.

-- ── users: manual KYC review ───────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "kyc_review_status" TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_review_notes"  TEXT,
  ADD COLUMN IF NOT EXISTS "kyc_reviewed_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kyc_reviewed_by"   UUID;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_kyc_review_status_valid";
ALTER TABLE "users" ADD CONSTRAINT "users_kyc_review_status_valid"
  CHECK ("kyc_review_status" IS NULL OR "kyc_review_status" IN ('approved', 'rejected'));

-- ── support_tickets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"            UUID NOT NULL,
  "customer_id"   UUID NOT NULL,
  "subject"       TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT 'other',
  "priority"      TEXT NOT NULL DEFAULT 'medium',
  "status"        TEXT NOT NULL DEFAULT 'open',
  "assignee_id"   UUID,
  "created_by_id" UUID,
  "resolved_at"   TIMESTAMP(3),
  "closed_at"     TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_tickets_status_valid"
    CHECK ("status" IN ('open', 'pending', 'resolved', 'closed')),
  CONSTRAINT "support_tickets_priority_valid"
    CHECK ("priority" IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS "support_tickets_status_updated_at_idx" ON "support_tickets"("status", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "support_tickets_customer_id_created_at_idx" ON "support_tickets"("customer_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "support_tickets_assignee_id_idx" ON "support_tickets"("assignee_id");

ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_customer_id_fkey";
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_assignee_id_fkey";
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ticket_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id"          UUID NOT NULL,
  "ticket_id"   UUID NOT NULL,
  "author_id"   UUID,
  "author_role" TEXT NOT NULL DEFAULT 'staff',
  "body"        TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");

ALTER TABLE "ticket_messages" DROP CONSTRAINT IF EXISTS "ticket_messages_ticket_id_fkey";
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_messages" DROP CONSTRAINT IF EXISTS "ticket_messages_author_id_fkey";
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
