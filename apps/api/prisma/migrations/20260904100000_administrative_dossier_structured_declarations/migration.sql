-- AlterTable (Sprint 8C Phase 2 — mission §18, signature LOCALE sur AdministrativeDocument)
ALTER TABLE "administrative_documents" ADD COLUMN "signature_mode" VARCHAR(12) NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "administrative_documents" ADD COLUMN "signature_status" VARCHAR(12) NOT NULL DEFAULT 'NOT_REQUIRED';

-- CreateTable
CREATE TABLE "administrative_consortiums" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "type" VARCHAR(12) NOT NULL,
    "legal_form" VARCHAR(200),
    "liability_mode" VARCHAR(200),
    "mandataire_member_id" VARCHAR(80),
    "members" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_consortiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_dc1_declarations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "candidate_type" VARCHAR(12) NOT NULL,
    "consortium_id" UUID,
    "declarations" TEXT,
    "signatory_name" VARCHAR(200),
    "signatory_capacity" VARCHAR(200),
    "signing_power_id" UUID,
    "administrative_document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_dc1_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_dc2_declarations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_dc2_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_dc2_declaration_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dc2_declaration_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_dc2_declaration_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_dume_declarations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_dume_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_dume_declaration_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dume_declaration_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_dume_declaration_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_subcontractor_declarations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "subcontractor_name" VARCHAR(300) NOT NULL,
    "subcontractor_legal_identifier" VARCHAR(80),
    "services_description" TEXT NOT NULL,
    "amount_value" DECIMAL(14,2) NOT NULL,
    "amount_currency" VARCHAR(3) NOT NULL,
    "percentage_of_total" DOUBLE PRECISION,
    "payment_terms" TEXT,
    "direct_payment_applicable" BOOLEAN,
    "required_documents" JSONB NOT NULL DEFAULT '[]',
    "administrative_document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_subcontractor_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_engagement_acts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "reference" VARCHAR(200),
    "lot_reference" VARCHAR(200),
    "object" TEXT,
    "duration_months" INTEGER,
    "variants" TEXT,
    "subcontracting_summary" TEXT,
    "rib_document_id" UUID,
    "signatory_name" VARCHAR(200),
    "signatory_capacity" VARCHAR(200),
    "administrative_document_id" UUID,
    "pricing_estimate_id" UUID,
    "pricing_estimate_version_number" INTEGER,
    "frozen_amount_value" DECIMAL(14,2),
    "frozen_amount_currency" VARCHAR(3),
    "frozen_at" TIMESTAMP(3),
    "frozen_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_engagement_acts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_signing_powers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "holder_name" VARCHAR(200) NOT NULL,
    "represented_entity_description" VARCHAR(300) NOT NULL,
    "administrative_document_id" UUID,
    "valid_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "scope" VARCHAR(300) NOT NULL,
    "limitations" TEXT,
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_signing_powers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrative_consortiums_id_organization_id_key" ON "administrative_consortiums"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_consortiums_organization_id_tender_id_key" ON "administrative_consortiums"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc1_declarations_id_organization_id_key" ON "administrative_dc1_declarations"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc1_declarations_organization_id_tender_id_key" ON "administrative_dc1_declarations"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc2_declarations_id_organization_id_key" ON "administrative_dc2_declarations"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc2_declarations_organization_id_tender_id_key" ON "administrative_dc2_declarations"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc2_declaration_versions_id_organization_id_key" ON "administrative_dc2_declaration_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dc2_declaration_versions_dc2_declaration_id_key" ON "administrative_dc2_declaration_versions"("dc2_declaration_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dume_declarations_id_organization_id_key" ON "administrative_dume_declarations"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dume_declarations_organization_id_tender_id_key" ON "administrative_dume_declarations"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dume_declaration_versions_id_organization_i_key" ON "administrative_dume_declaration_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_dume_declaration_versions_dume_declaration__key" ON "administrative_dume_declaration_versions"("dume_declaration_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_subcontractor_declarations_id_organization__key" ON "administrative_subcontractor_declarations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "administrative_subcontractor_declarations_organization_id_idx" ON "administrative_subcontractor_declarations"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_engagement_acts_id_organization_id_key" ON "administrative_engagement_acts"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_engagement_acts_organization_id_tender_id_key" ON "administrative_engagement_acts"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_signing_powers_id_organization_id_key" ON "administrative_signing_powers"("id", "organization_id");

-- CreateIndex
CREATE INDEX "administrative_signing_powers_organization_id_tender_id_idx" ON "administrative_signing_powers"("organization_id", "tender_id");

-- AddForeignKey
ALTER TABLE "administrative_consortiums" ADD CONSTRAINT "administrative_consortiums_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dc1_declarations" ADD CONSTRAINT "administrative_dc1_declarations_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dc1_declarations" ADD CONSTRAINT "administrative_dc1_declarations_consortium_id_organizatio_fkey" FOREIGN KEY ("consortium_id", "organization_id") REFERENCES "administrative_consortiums"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dc2_declarations" ADD CONSTRAINT "administrative_dc2_declarations_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dc2_declaration_versions" ADD CONSTRAINT "administrative_dc2_declaration_versions_dc2_declaration_i_fkey" FOREIGN KEY ("dc2_declaration_id", "organization_id") REFERENCES "administrative_dc2_declarations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dume_declarations" ADD CONSTRAINT "administrative_dume_declarations_tender_id_organization_i_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_dume_declaration_versions" ADD CONSTRAINT "administrative_dume_declaration_versions_dume_declaration_fkey" FOREIGN KEY ("dume_declaration_id", "organization_id") REFERENCES "administrative_dume_declarations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_subcontractor_declarations" ADD CONSTRAINT "administrative_subcontractor_declarations_tender_id_organ_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_engagement_acts" ADD CONSTRAINT "administrative_engagement_acts_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_signing_powers" ADD CONSTRAINT "administrative_signing_powers_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (mission Sprint 8C — catalogues fermés, hand-appended, jamais un enum natif Prisma)
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_signature_mode_check" CHECK ("signature_mode" IN ('NOT_REQUIRED','MANUAL','ELECTRONIC','EXTERNAL'));
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_signature_status_check" CHECK ("signature_status" IN ('NOT_REQUIRED','PENDING','SIGNED','REJECTED','EXPIRED','CANCELLED'));

ALTER TABLE "administrative_consortiums" ADD CONSTRAINT "administrative_consortiums_type_check" CHECK ("type" IN ('JOINT','SOLIDARITY','OTHER'));

ALTER TABLE "administrative_dc1_declarations" ADD CONSTRAINT "administrative_dc1_declarations_candidate_type_check" CHECK ("candidate_type" IN ('INDIVIDUAL','CONSORTIUM'));

ALTER TABLE "administrative_subcontractor_declarations" ADD CONSTRAINT "administrative_subcontractor_declarations_amount_value_check" CHECK ("amount_value" >= 0);
ALTER TABLE "administrative_subcontractor_declarations" ADD CONSTRAINT "administrative_subcontractor_declarations_percentage_of_t_check" CHECK ("percentage_of_total" IS NULL OR ("percentage_of_total" >= 0 AND "percentage_of_total" <= 100));
