-- CreateTable
CREATE TABLE "pricing_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "lot_id" UUID,
    "client_account_id" UUID NOT NULL,
    "financial_document_type" VARCHAR(30) NOT NULL,
    "source_document_id" UUID NOT NULL,
    "source_document_version_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_schedule_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pricing_schedule_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "source_document_version_id" UUID NOT NULL,
    "mapping_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "pricing_schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_schedule_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pricing_schedule_version_id" UUID NOT NULL,
    "sheet_name" VARCHAR(200) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'PRICE_ITEM',
    "hierarchy_level" INTEGER NOT NULL DEFAULT 0,
    "parent_line_id" UUID,
    "designation" VARCHAR(1000) NOT NULL,
    "unit" VARCHAR(60),
    "quantity" DECIMAL(18,6),
    "designation_cell_ref" VARCHAR(20),
    "quantity_cell_ref" VARCHAR(20),
    "buyer_unit_price_cell_ref" VARCHAR(20),
    "buyer_total_cell_ref" VARCHAR(20),
    "proposed_unit_price" DECIMAL(18,6),
    "proposed_total" DECIMAL(18,6),
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "cost_breakdown" JSONB,
    "candidate_comment" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
    "matching_key" VARCHAR(300),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_schedules_id_organization_id_key" ON "pricing_schedules"("id", "organization_id");
CREATE INDEX "pricing_schedules_organization_id_tender_id_idx" ON "pricing_schedules"("organization_id", "tender_id");
CREATE INDEX "pricing_schedules_organization_id_client_account_id_idx" ON "pricing_schedules"("organization_id", "client_account_id");
-- Un seul chiffrage par (Tender, lot, candidate, fichier source) — deux index partiels (même motif
-- que technical_memos_org_tender_lot_key, Sprint 12) : Postgres traite chaque lotId NULL comme
-- distinct dans un index unique classique.
CREATE UNIQUE INDEX "pricing_schedules_org_tender_lot_client_source_key" ON "pricing_schedules"("organization_id", "tender_id", "lot_id", "client_account_id", "source_document_id") WHERE "lot_id" IS NOT NULL;
CREATE UNIQUE INDEX "pricing_schedules_org_tender_client_source_null_lot_key" ON "pricing_schedules"("organization_id", "tender_id", "client_account_id", "source_document_id") WHERE "lot_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "pricing_schedule_versions_id_organization_id_key" ON "pricing_schedule_versions"("id", "organization_id");
CREATE UNIQUE INDEX "pricing_schedule_versions_schedule_id_version_number_key" ON "pricing_schedule_versions"("pricing_schedule_id", "version_number");
CREATE INDEX "pricing_schedule_versions_organization_id_schedule_id_idx" ON "pricing_schedule_versions"("organization_id", "pricing_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_schedule_lines_id_organization_id_key" ON "pricing_schedule_lines"("id", "organization_id");
CREATE UNIQUE INDEX "pricing_schedule_lines_version_id_sheet_row_key" ON "pricing_schedule_lines"("pricing_schedule_version_id", "sheet_name", "row_number");
CREATE INDEX "pricing_schedule_lines_organization_id_version_id_idx" ON "pricing_schedule_lines"("organization_id", "pricing_schedule_version_id");
CREATE INDEX "pricing_schedule_lines_organization_id_matching_key_idx" ON "pricing_schedule_lines"("organization_id", "matching_key");

-- AddForeignKey
ALTER TABLE "pricing_schedules" ADD CONSTRAINT "pricing_schedules_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_schedule_versions" ADD CONSTRAINT "pricing_schedule_versions_schedule_id_organization_id_fkey" FOREIGN KEY ("pricing_schedule_id", "organization_id") REFERENCES "pricing_schedules"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_schedule_lines" ADD CONSTRAINT "pricing_schedule_lines_version_id_organization_id_fkey" FOREIGN KEY ("pricing_schedule_version_id", "organization_id") REFERENCES "pricing_schedule_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "pricing_schedules" ADD CONSTRAINT "pricing_schedules_financial_document_type_check" CHECK ("financial_document_type" IN ('BPU','DPGF','DQE','OTHER_FINANCIAL_SCHEDULE'));
ALTER TABLE "pricing_schedules" ADD CONSTRAINT "pricing_schedules_status_check" CHECK ("status" IN ('DRAFT','READY','VALIDATED','EXPORTED'));
ALTER TABLE "pricing_schedule_versions" ADD CONSTRAINT "pricing_schedule_versions_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','VALIDATED'));
ALTER TABLE "pricing_schedule_lines" ADD CONSTRAINT "pricing_schedule_lines_kind_check" CHECK ("kind" IN ('PRICE_ITEM','SECTION_HEADER','SUBTOTAL','NOTE'));
ALTER TABLE "pricing_schedule_lines" ADD CONSTRAINT "pricing_schedule_lines_status_check" CHECK ("status" IN ('EMPTY','PRICED','NEEDS_REVIEW'));
