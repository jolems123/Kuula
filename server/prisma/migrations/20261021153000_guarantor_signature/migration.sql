ALTER TABLE "loan_guarantor_invitations"
 ADD COLUMN "guarantor_user_id" UUID,
 ADD COLUMN "signature_hash" TEXT,
 ADD COLUMN "signed_at" TIMESTAMP(3),
 ADD COLUMN "agreement_snapshot" JSONB;
CREATE INDEX "loan_guarantor_invitations_guarantor_user_id_idx" ON "loan_guarantor_invitations"("guarantor_user_id");
