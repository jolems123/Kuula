-- Two-person refunds of customer money Kuula holds but could not apply to a loan
-- (UNAPPLIED_CUSTOMER_FUNDS or LOAN_COLLECTIONS_SUSPENSE).
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  source_account TEXT NOT NULL CHECK (source_account IN ('UNAPPLIED_CUSTOMER_FUNDS','LOAN_COLLECTIONS_SUSPENSE')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','approved','sent','completed','failed','cancelled')),
  requested_by UUID NOT NULL,
  approved_by UUID,
  refund_transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  failure_reason TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON refund_requests (status, created_at);
CREATE INDEX IF NOT EXISTS refund_requests_source_idx ON refund_requests (source_transaction_id);
