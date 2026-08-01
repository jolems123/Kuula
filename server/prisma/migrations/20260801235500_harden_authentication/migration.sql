-- Invalidate any legacy plaintext OTP values and replace them with keyed hashes.
ALTER TABLE "users" RENAME COLUMN "otp_code" TO "otp_hash";

ALTER TABLE "users"
  ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otp_purpose" TEXT,
  ADD COLUMN "otp_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otp_last_sent_at" TIMESTAMP(3),
  ADD COLUMN "otp_locked_until" TIMESTAMP(3);

UPDATE "users"
SET
  "otp_hash" = NULL,
  "otp_expires_at" = NULL,
  "otp_purpose" = NULL,
  "otp_attempts" = 0,
  "otp_last_sent_at" = NULL,
  "otp_locked_until" = NULL;
