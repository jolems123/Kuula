-- MarzPay's own charge for a transaction, kept apart from the borrower amount.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "provider_fee" BIGINT;
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_provider_fee_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_provider_fee_check" CHECK ("provider_fee" IS NULL OR "provider_fee" >= 0);

-- Posted accounting is append-only. Corrections are made with new reversing journals.
CREATE OR REPLACE FUNCTION kuula_journal_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted journals are append-only; post a reversing journal instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journals_append_only ON journals;
CREATE TRIGGER trg_journals_append_only
BEFORE UPDATE OR DELETE ON journals
FOR EACH ROW EXECUTE FUNCTION kuula_journal_append_only();

DROP TRIGGER IF EXISTS trg_journal_entries_append_only ON journal_entries;
CREATE TRIGGER trg_journal_entries_append_only
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION kuula_journal_append_only();
