-- CreateTable
CREATE TABLE "response_packages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "lot_id" UUID,
    "client_account_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "response_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_package_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "response_package_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "response_package_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "response_package_version_id" UUID NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "document_type" VARCHAR(60),
    "source_type" VARCHAR(30) NOT NULL,
    "source_id" UUID,
    "document_id" UUID,
    "document_version_id" UUID,
    "requirement_type" VARCHAR(20) NOT NULL,
    "applicability_status" VARCHAR(20) NOT NULL,
    "condition_text" TEXT,
    "status" VARCHAR(30) NOT NULL,
    "lot_id" UUID,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "response_package_version_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "manifest" JSONB NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "response_packages_id_organization_id_key" ON "response_packages"("id", "organization_id");
CREATE INDEX "response_packages_organization_id_tender_id_idx" ON "response_packages"("organization_id", "tender_id");
CREATE INDEX "response_packages_organization_id_client_account_id_idx" ON "response_packages"("organization_id", "client_account_id");
-- Un seul dossier de réponse par (Tender, lot, candidate) — deux index partiels (même motif que
-- pricing_schedules_org_tender_lot_client_source_key, Sprint 13) : Postgres traite chaque lotId
-- NULL comme distinct dans un index unique classique. Note : contrairement à PricingSchedule, il
-- n'y a pas de "fichier source" distinctif ici — un seul ResponsePackage par (tender, lot, candidate).
CREATE UNIQUE INDEX "response_packages_org_tender_lot_client_key" ON "response_packages"("organization_id", "tender_id", "lot_id", "client_account_id") WHERE "lot_id" IS NOT NULL;
CREATE UNIQUE INDEX "response_packages_org_tender_client_null_lot_key" ON "response_packages"("organization_id", "tender_id", "client_account_id") WHERE "lot_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "response_package_versions_id_organization_id_key" ON "response_package_versions"("id", "organization_id");
CREATE UNIQUE INDEX "response_package_versions_package_id_version_number_key" ON "response_package_versions"("response_package_id", "version_number");
CREATE INDEX "response_package_versions_organization_id_package_id_idx" ON "response_package_versions"("organization_id", "response_package_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_items_id_organization_id_key" ON "package_items"("id", "organization_id");
CREATE INDEX "package_items_organization_id_version_id_idx" ON "package_items"("organization_id", "response_package_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_artifacts_id_organization_id_key" ON "package_artifacts"("id", "organization_id");
CREATE INDEX "package_artifacts_organization_id_version_id_idx" ON "package_artifacts"("organization_id", "response_package_version_id");

-- AddForeignKey
ALTER TABLE "response_packages" ADD CONSTRAINT "response_packages_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "response_package_versions" ADD CONSTRAINT "response_package_versions_package_id_organization_id_fkey" FOREIGN KEY ("response_package_id", "organization_id") REFERENCES "response_packages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_version_id_organization_id_fkey" FOREIGN KEY ("response_package_version_id", "organization_id") REFERENCES "response_package_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_artifacts" ADD CONSTRAINT "package_artifacts_version_id_organization_id_fkey" FOREIGN KEY ("response_package_version_id", "organization_id") REFERENCES "response_package_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "response_packages" ADD CONSTRAINT "response_packages_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','READY','VALIDATED','EXPORTED','INVALIDATED'));
ALTER TABLE "response_package_versions" ADD CONSTRAINT "response_package_versions_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','VALIDATED'));
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_category_check" CHECK ("category" IN ('ADMINISTRATIVE','TECHNICAL','FINANCIAL','LEGAL','CERTIFICATE','ANNEX','OTHER'));
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_source_type_check" CHECK ("source_type" IN ('CHECKLIST_ITEM','ADMINISTRATIVE_DOCUMENT','TECHNICAL_MEMO','PRICING_SCHEDULE_FINAL_FILE','UPLOADED_DOCUMENT','MANUAL'));
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_requirement_type_check" CHECK ("requirement_type" IN ('REQUIRED','OPTIONAL','CONDITIONAL'));
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_applicability_status_check" CHECK ("applicability_status" IN ('APPLICABLE','NOT_APPLICABLE','NEEDS_REVIEW'));
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_status_check" CHECK ("status" IN ('READY','MISSING_BLOCKING','MISSING_NON_BLOCKING','NOT_APPLICABLE','NEEDS_REVIEW'));
