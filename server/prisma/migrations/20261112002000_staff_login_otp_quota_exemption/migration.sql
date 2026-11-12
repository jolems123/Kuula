-- Staff login verification is controlled by a per-account resend cooldown,
-- a valid password, an unexpired single-use OTP and incorrect-code lockout.
-- Do not apply the SMS-delivery 5/hour and 10/24h quota to admin_login.
-- Keep the durable quota for customer SMS and other OTP purposes.
-- The pre-existing delivery event history is intentionally retained.
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

  IF NEW.otp_purpose = 'admin_login' THEN
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
