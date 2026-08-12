CREATE TABLE "markets" (
  "code" TEXT NOT NULL,
  "country_name" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "dialing_code" TEXT NOT NULL,
  "default_locale" TEXT NOT NULL DEFAULT 'en',
  "status" TEXT NOT NULL DEFAULT 'planned',
  "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "markets_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "credit_products" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "market_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "purpose_type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "min_amount" BIGINT NOT NULL,
  "max_amount" BIGINT NOT NULL,
  "min_term_days" INTEGER NOT NULL,
  "max_term_days" INTEGER NOT NULL,
  "disbursement_mode" TEXT NOT NULL,
  "partner_required" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "credit_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "growth_lines" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "market_code" TEXT NOT NULL,
  "total_limit" BIGINT NOT NULL DEFAULT 0,
  "available_limit" BIGINT NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'building',
  "source_assessment_id" UUID,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "rationale" JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "growth_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_pass_snapshots" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "market_code" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "tier" TEXT NOT NULL,
  "kyc_level" TEXT NOT NULL,
  "repayment_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "available_limit" BIGINT NOT NULL DEFAULT 0,
  "signals" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_pass_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partners" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "market_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "partner_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "settlement_mode" TEXT NOT NULL DEFAULT 'direct_payee',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_locations" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "district" TEXT,
  "country" TEXT NOT NULL,
  "phone" TEXT,
  "external_reference" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_financing_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "market_code" TEXT NOT NULL,
  "partner_id" UUID NOT NULL,
  "partner_location_id" UUID,
  "product_id" UUID NOT NULL,
  "external_reference" TEXT,
  "invoice_reference" TEXT,
  "purpose" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "payee_name" TEXT NOT NULL,
  "payee_reference" TEXT,
  "loan_application_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_financing_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_products_code_key" ON "credit_products"("code");
CREATE INDEX "credit_products_market_code_status_idx" ON "credit_products"("market_code", "status");
CREATE INDEX "credit_products_category_status_idx" ON "credit_products"("category", "status");
CREATE UNIQUE INDEX "growth_lines_user_id_key" ON "growth_lines"("user_id");
CREATE INDEX "growth_lines_market_code_status_idx" ON "growth_lines"("market_code", "status");
CREATE INDEX "growth_lines_expires_at_idx" ON "growth_lines"("expires_at");
CREATE INDEX "credit_pass_snapshots_user_id_created_at_idx" ON "credit_pass_snapshots"("user_id", "created_at" DESC);
CREATE INDEX "credit_pass_snapshots_market_code_created_at_idx" ON "credit_pass_snapshots"("market_code", "created_at" DESC);
CREATE UNIQUE INDEX "partners_code_key" ON "partners"("code");
CREATE INDEX "partners_market_code_partner_type_status_idx" ON "partners"("market_code", "partner_type", "status");
CREATE INDEX "partner_locations_partner_id_active_idx" ON "partner_locations"("partner_id", "active");
CREATE INDEX "partner_locations_district_active_idx" ON "partner_locations"("district", "active");
CREATE UNIQUE INDEX "partner_financing_requests_external_reference_key" ON "partner_financing_requests"("external_reference");
CREATE UNIQUE INDEX "partner_financing_requests_loan_application_id_key" ON "partner_financing_requests"("loan_application_id");
CREATE INDEX "partner_financing_requests_user_id_created_at_idx" ON "partner_financing_requests"("user_id", "created_at" DESC);
CREATE INDEX "partner_financing_requests_partner_id_status_created_at_idx" ON "partner_financing_requests"("partner_id", "status", "created_at");
CREATE INDEX "partner_financing_requests_market_code_status_idx" ON "partner_financing_requests"("market_code", "status");

ALTER TABLE "credit_products" ADD CONSTRAINT "credit_products_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_lines" ADD CONSTRAINT "growth_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "growth_lines" ADD CONSTRAINT "growth_lines_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_pass_snapshots" ADD CONSTRAINT "credit_pass_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_pass_snapshots" ADD CONSTRAINT "credit_pass_snapshots_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partners" ADD CONSTRAINT "partners_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_locations" ADD CONSTRAINT "partner_locations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_partner_location_id_fkey" FOREIGN KEY ("partner_location_id") REFERENCES "partner_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "credit_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_financing_requests" ADD CONSTRAINT "partner_financing_requests_loan_application_id_fkey" FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
