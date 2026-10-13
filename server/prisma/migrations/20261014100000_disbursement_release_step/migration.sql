-- A customer payout now waits for an independent staff release before any money moves.
ALTER TABLE disbursement_batches DROP CONSTRAINT IF EXISTS disbursement_batches_status_check;
ALTER TABLE disbursement_batches ADD CONSTRAINT disbursement_batches_status_check
  CHECK (status IN ('awaiting_release','planned','processing','partially_disbursed','settled','failed','attention_required','cancelled'));

ALTER TABLE disbursement_batches ADD COLUMN IF NOT EXISTS released_by UUID;
ALTER TABLE disbursement_batches ADD COLUMN IF NOT EXISTS released_at TIMESTAMP(3);
