-- Add provider settlement and webhook audit fields to the financial ledger.
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "reference" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_status" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Only one mobile-money collection may be pending for a repayment at a time.
ALTER TABLE "repayments"
  ADD COLUMN IF NOT EXISTS "pending_collection_ref" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_reference_key" ON "transactions"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "repayments_pending_collection_ref_key" ON "repayments"("pending_collection_ref");
CREATE INDEX IF NOT EXISTS "transactions_transaction_id_idx" ON "transactions"("transaction_id");
CREATE INDEX IF NOT EXISTS "loan_applications_loan_id_idx" ON "loan_applications"("loan_id");
CREATE INDEX IF NOT EXISTS "repayments_loan_id_idx" ON "repayments"("loan_id");
