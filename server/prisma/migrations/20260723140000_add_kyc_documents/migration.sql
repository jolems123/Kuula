-- AlterTable
ALTER TABLE "users" ADD COLUMN     "kyc_doc_front_ref" TEXT,
ADD COLUMN     "kyc_doc_back_ref" TEXT,
ADD COLUMN     "kyc_provider" TEXT,
ADD COLUMN     "kyc_reference" TEXT,
ADD COLUMN     "kyc_submitted_at" TIMESTAMP(3);
