ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS otp_sent_count integer NOT NULL DEFAULT 0;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_otp_sent_count_nonnegative;
ALTER TABLE users
  ADD CONSTRAINT users_otp_sent_count_nonnegative CHECK (otp_sent_count >= 0);
