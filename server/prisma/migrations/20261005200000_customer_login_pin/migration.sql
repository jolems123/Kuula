-- Customers sign in with a 6-digit PIN; the password stays as a backup.
-- Additive only: existing accounts keep their password and can add a PIN later.
ALTER TABLE "users" ADD COLUMN "pin_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "login_locked_until" TIMESTAMP(3);
