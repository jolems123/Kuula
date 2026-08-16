-- Atomic destination daily-limit enforcement.
--
-- Application-level prechecks are useful UX, but they are not sufficient under
-- concurrency: two requests can read the same committed total and both insert.
-- This trigger serializes reservations per market/provider/network/destination
-- and re-checks the effective limit inside the INSERT transaction.

CREATE OR REPLACE FUNCTION kuula_enforce_disbursement_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_general_daily bigint;
  v_destination_daily bigint;
  v_effective_daily bigint;
  v_committed bigint;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtextextended(
    NEW.market_code || '|' || NEW.provider || '|' || NEW.network || '|' || NEW.beneficiary_type || '|' || NEW.beneficiary_reference,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT max_daily_amount
    INTO v_general_daily
  FROM payment_provider_limits
  WHERE market_code = NEW.market_code
    AND provider = NEW.provider
    AND network = NEW.network
    AND beneficiary_type = NEW.beneficiary_type
    AND enabled = true
    AND effective_from <= CURRENT_TIMESTAMP
    AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
  ORDER BY effective_from DESC
  LIMIT 1;

  SELECT max_daily_amount
    INTO v_destination_daily
  FROM payment_destination_profiles
  WHERE market_code = NEW.market_code
    AND provider = NEW.provider
    AND network = NEW.network
    AND beneficiary_type = NEW.beneficiary_type
    AND beneficiary_reference = NEW.beneficiary_reference
    AND status = 'verified'
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  ORDER BY verified_at DESC
  LIMIT 1;

  IF v_general_daily IS NULL THEN
    v_effective_daily := v_destination_daily;
  ELSIF v_destination_daily IS NULL THEN
    v_effective_daily := v_general_daily;
  ELSE
    v_effective_daily := LEAST(v_general_daily, v_destination_daily);
  END IF;

  IF v_effective_daily IS NULL THEN
    RETURN NEW;
  END IF;

  -- Uganda is the only active real-money market in this release. Keep the
  -- provider accounting day aligned with Africa/Kampala instead of the Railway
  -- database/server timezone. Future markets should make this timezone a market
  -- configuration field before activation.
  v_day_start := date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
  v_day_end := v_day_start + interval '1 day';

  SELECT COALESCE(SUM(approved_amount), 0)::bigint
    INTO v_committed
  FROM disbursement_batches
  WHERE market_code = NEW.market_code
    AND provider = NEW.provider
    AND network = NEW.network
    AND beneficiary_type = NEW.beneficiary_type
    AND beneficiary_reference = NEW.beneficiary_reference
    AND created_at >= v_day_start
    AND created_at < v_day_end
    AND status IN ('planned','processing','partially_disbursed','settled','attention_required');

  IF v_committed + NEW.approved_amount > v_effective_daily THEN
    RAISE EXCEPTION 'Disbursement would exceed verified daily destination limit'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kuula_disbursement_daily_limit ON disbursement_batches;
CREATE TRIGGER trg_kuula_disbursement_daily_limit
BEFORE INSERT ON disbursement_batches
FOR EACH ROW
EXECUTE FUNCTION kuula_enforce_disbursement_daily_limit();
