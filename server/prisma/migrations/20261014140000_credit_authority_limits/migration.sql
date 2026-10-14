-- Approval authority per staff role, set by the super admin. No row means no limit is
-- configured for that role (behaviour before this table existed).
CREATE TABLE IF NOT EXISTS credit_authority_limits (
  role TEXT PRIMARY KEY,
  max_amount BIGINT NOT NULL CHECK (max_amount > 0),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
