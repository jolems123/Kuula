-- Authoritative daily-destination limit enforcement. Application pre-checks are
-- useful for UX, but this trigger is the concurrency-safe financial boundary.

CREATE OR REPLACE FUNCTION kuula_market_timezone(p_market text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(p_market)
    WHEN 'UG' THEN 'Africa/Kampala'
    WHEN 'KE' THEN 'Africa/Nairobi'
    WHEN 'TZ' THEN 'Africa/Dar_es_Salaam'
    WHEN 'RW' THEN 'Africa/Kigali'
    ELSE 'UTC'
  END;
$$;

CREATE OR REPLACE FUNCTION enforce_disbursement_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_timezone text;
  v_general_daily bigint;
  v_destination_daily bigint;
  v_effective_daily bigint;
  v_committed bigint;
  v_lock_key bigint;
BEGIN
  v_timezone := kuula_market_timezone(NEW.market_code);

  -- Serialize all reservations for one provider/network/destination. The lock is
  -- transaction-scoped, so concurrent accepts cannot both pass the same balance.
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

  SELECT COALESCE(SUM(approved_amount), 0)::bigint
    INTO v_committed
  FROM disbursement_batches
  WHERE market_code = NEW.market_code
    AND provider = NEW.provider
    AND network = NEW.network
    AND beneficiary_type = NEW.beneficiary_type
    AND beneficiary_reference = NEW.beneficiary_reference
    AND (created_at AT TIME ZONE v_timezone)::date = (CURRENT_TIMESTAMP AT TIME ZONE v_timezone)::date
    AND status IN ('planned','processing','partially_disbursed','settled','attention_required');

  IF v_committed + NEW.approved_amount > v_effective_daily THEN
    RAISE EXCEPTION 'Disbursement would exceed the verified daily destination limit'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disbursement_daily_limit ON disbursement_batches;
CREATE TRIGGER trg_disbursement_daily_limit
BEFORE INSERT ON disbursement_batches
FOR EACH ROW
EXECUTE FUNCTION enforce_disbursement_daily_limit();
