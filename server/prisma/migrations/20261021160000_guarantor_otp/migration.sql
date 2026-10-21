ALTER TABLE "loan_guarantor_invitations"
 ADD COLUMN "otp_hash" TEXT,
 ADD COLUMN "otp_expires_at" TIMESTAMP(3),
 ADD COLUMN "otp_sent_at" TIMESTAMP(3),
 ADD COLUMN "otp_verified_at" TIMESTAMP(3),
 ADD COLUMN "otp_attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "otp_send_count" INTEGER NOT NULL DEFAULT 0;
