-- Savings deposits and withdrawals previously changed balances without a
-- provider collection or payout. Preserve those rows for audit, but remove
-- them from recognized customer funds and completed financial reporting.

UPDATE "transactions"
SET
  "status" = 'failed',
  "provider" = COALESCE("provider", 'legacy-simulation'),
  "provider_status" = 'quarantined_unsettled',
  "provider_payload" = COALESCE("provider_payload", '{}'::jsonb)
    || jsonb_build_object(
      'quarantined_at', CURRENT_TIMESTAMP,
      'reason', 'Savings transaction had no verified provider settlement'
    ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" IN ('savings_deposit', 'savings_withdrawal')
  AND "status" = 'completed';

UPDATE "savings_accounts"
SET
  "balance" = 0,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "balance" <> 0;
