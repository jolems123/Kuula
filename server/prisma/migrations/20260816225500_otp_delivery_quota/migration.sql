-- Durable per-account SMS quota. This is independent of source IP so rotating
-- bots cannot continuously trigger SMS delivery to the same customer number.

CREATE TABLE IF NOT EXISTS otp_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_delivery_events_user_time_idx ON otp_delivery_events (user_id, sent_at DESC);

CREATE OR REPLACE FUNCTION enforce_otp_delivery_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_hour_count integer;
  v_day_count integer;
BEGIN
  IF NEW.otp_last_sent_at IS NULL OR NEW.otp_last_sent_at IS NOT DISTINCT FROM OLD.otp_last_sent_at THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_hour_count
  FROM otp_delivery_events
  WHERE user_id = NEW.id AND sent_at >= CURRENT_TIMESTAMP - interval '1 hour';

  SELECT COUNT(*)::integer INTO v_day_count
  FROM otp_delivery_events
  WHERE user_id = NEW.id AND sent_at >= CURRENT_TIMESTAMP - interval '24 hours';

  IF v_hour_count >= 5 OR v_day_count >= 10 THEN
    RAISE EXCEPTION 'OTP delivery quota exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO otp_delivery_events (user_id, sent_at) VALUES (NEW.id, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_otp_delivery_quota ON users;
CREATE TRIGGER trg_otp_delivery_quota
BEFORE UPDATE OF otp_last_sent_at ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_otp_delivery_quota();
