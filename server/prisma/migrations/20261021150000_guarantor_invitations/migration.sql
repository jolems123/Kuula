CREATE TABLE "loan_guarantor_invitations" (
 "id" UUID NOT NULL,
 "requirement_id" UUID NOT NULL,
 "full_name" TEXT NOT NULL,
 "phone" TEXT NOT NULL,
 "relationship" TEXT NOT NULL,
 "invitation_token_hash" TEXT NOT NULL,
 "expires_at" TIMESTAMP(3) NOT NULL,
 "accepted_at" TIMESTAMP(3),
 "declined_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "loan_guarantor_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_guarantor_invitations_requirement_id_key" ON "loan_guarantor_invitations"("requirement_id");
CREATE UNIQUE INDEX "loan_guarantor_invitations_invitation_token_hash_key" ON "loan_guarantor_invitations"("invitation_token_hash");
CREATE INDEX "loan_guarantor_invitations_phone_idx" ON "loan_guarantor_invitations"("phone");
ALTER TABLE "loan_guarantor_invitations" ADD CONSTRAINT "loan_guarantor_invitations_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "loan_guarantor_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
