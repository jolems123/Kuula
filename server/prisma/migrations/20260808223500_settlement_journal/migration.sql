CREATE TABLE "journals" (
  "id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
  "id" UUID NOT NULL,
  "journal_id" UUID NOT NULL,
  "account_code" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "user_id" UUID,
  "loan_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journal_entries_direction_check" CHECK ("direction" IN ('debit', 'credit')),
  CONSTRAINT "journal_entries_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "journals_transaction_id_key" ON "journals"("transaction_id");
CREATE UNIQUE INDEX "journals_reference_key" ON "journals"("reference");
CREATE INDEX "journals_posted_at_idx" ON "journals"("posted_at");
CREATE INDEX "journal_entries_journal_id_idx" ON "journal_entries"("journal_id");
CREATE INDEX "journal_entries_account_code_created_at_idx" ON "journal_entries"("account_code", "created_at");
CREATE INDEX "journal_entries_user_id_created_at_idx" ON "journal_entries"("user_id", "created_at");
CREATE INDEX "journal_entries_loan_id_idx" ON "journal_entries"("loan_id");

ALTER TABLE "journals" ADD CONSTRAINT "journals_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
