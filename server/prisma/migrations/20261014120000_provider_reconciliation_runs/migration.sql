-- One row per daily comparison of Kuula's transactions against MarzPay's records.
CREATE TABLE IF NOT EXISTS provider_reconciliation_runs (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  day DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','matched','exceptions','failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  triggered_by UUID,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS provider_reconciliation_runs_day_idx ON provider_reconciliation_runs (provider, day DESC, started_at DESC);
