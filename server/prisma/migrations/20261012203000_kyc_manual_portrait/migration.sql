-- Retain existing provider-submitted documents, add the optional portrait for manual KYC.
ALTER TABLE "kyc_submissions"
  ADD COLUMN "portrait_ref" TEXT,
  ADD COLUMN "portrait_mime" TEXT;
