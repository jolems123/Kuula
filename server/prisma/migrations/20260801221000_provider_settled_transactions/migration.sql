-- Add provider settlement and webhook audit fields to the financial ledger.
ALTER TABLE "transactions"
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "provider_status" TEXT,
  ADD COLUMN "provider_payload" JSONB,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "transactions_reference_key" ON "transactions"("reference");
CREATE INDEX "transactions_transaction_id_idx" ON "transactions"("transaction_id");
CREATE INDEX "loan_applications_loan_id_idx" ON "loan_applications"("loan_id");
CREATE INDEX "repayments_loan_id_idx" ON "repayments"("loan_id");
