-- Repair production drift where the reconciliation migration is recorded but
-- one or more transaction reconciliation columns are absent. This migration is
-- intentionally idempotent and safe on databases that already contain them.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "provider_amount" BIGINT,
  ADD COLUMN IF NOT EXISTS "provider_currency" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliation_status" TEXT NOT NULL DEFAULT 'unreconciled',
  ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "transactions_reconciliation_status_created_at_idx"
  ON "transactions"("reconciliation_status", "created_at");
