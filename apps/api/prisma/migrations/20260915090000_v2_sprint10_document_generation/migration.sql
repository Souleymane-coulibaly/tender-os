-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" VARCHAR(12) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "source_document_id" UUID NOT NULL,
    "source_document_version_id" UUID NOT NULL,
    "source_checksum" VARCHAR(64) NOT NULL,
    "discovered_placeholders" JSONB NOT NULL,
    "allow_partial_generation" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_field_mappings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_template_version_id" UUID NOT NULL,
    "field_key" VARCHAR(150) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "field_type" VARCHAR(12) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "format_options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_account_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "document_template_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_document_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "generated_document_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "previous_revision_id" UUID,
    "document_template_version_id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "data_snapshot" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "missing_fields" JSONB NOT NULL,
    "review_status" VARCHAR(10) NOT NULL DEFAULT 'GENERATED',
    "artifact_document_id" UUID,
    "artifact_document_version_id" UUID,
    "error_code" VARCHAR(60),
    "error_message" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generated_document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_id_organization_id_key" ON "document_templates"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_organization_id_name_key" ON "document_templates"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_id_organization_id_key" ON "document_template_versions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_organization_id_document_templ_key" ON "document_template_versions"("organization_id", "document_template_id", "version");

-- CreateIndex — Mission "une seule version ACTIVE par template" (PartialUniqueIndex non exprimable
-- dans le DSL Prisma, même motif que `export_template_versions_org_template_active_key`).
CREATE UNIQUE INDEX "document_template_versions_org_template_active_key" ON "document_template_versions"("organization_id", "document_template_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "document_template_field_mappings_document_template_versio_key" ON "document_template_field_mappings"("document_template_version_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_id_organization_id_key" ON "generated_documents"("id", "organization_id");

-- CreateIndex
CREATE INDEX "generated_documents_organization_id_tender_id_idx" ON "generated_documents"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_revisions_id_organization_id_key" ON "generated_document_revisions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_revisions_generated_document_id_revisi_key" ON "generated_document_revisions"("generated_document_id", "revision_number");

-- CreateIndex
CREATE INDEX "generated_document_revisions_organization_id_generated_do_idx" ON "generated_document_revisions"("organization_id", "generated_document_id");

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_document_template_id_organizat_fkey" FOREIGN KEY ("document_template_id", "organization_id") REFERENCES "document_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_field_mappings" ADD CONSTRAINT "document_template_field_mappings_document_template_versio_fkey" FOREIGN KEY ("document_template_version_id", "organization_id") REFERENCES "document_template_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_revisions" ADD CONSTRAINT "generated_document_revisions_generated_document_id_organi_fkey" FOREIGN KEY ("generated_document_id", "organization_id") REFERENCES "generated_documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_revisions" ADD CONSTRAINT "generated_document_revisions_document_template_version_id_fkey" FOREIGN KEY ("document_template_version_id", "organization_id") REFERENCES "document_template_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (hand-written, mirrors export_templates/export_template_versions style)
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_scope_check" CHECK ("scope" IN ('SYSTEM','ORGANIZATION'));
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));
ALTER TABLE "document_template_field_mappings" ADD CONSTRAINT "document_template_field_mappings_field_type_check" CHECK ("field_type" IN ('STRING','DATE','CURRENCY','PERCENTAGE','BOOLEAN','CHECKBOX','MULTILINE','LIST','TABLE'));
ALTER TABLE "generated_document_revisions" ADD CONSTRAINT "generated_document_revisions_status_check" CHECK ("status" IN ('PENDING','GENERATING','COMPLETED','FAILED'));
ALTER TABLE "generated_document_revisions" ADD CONSTRAINT "generated_document_revisions_review_status_check" CHECK ("review_status" IN ('GENERATED','REVIEWED','VALIDATED'));
