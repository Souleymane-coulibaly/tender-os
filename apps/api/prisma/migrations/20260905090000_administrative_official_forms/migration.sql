-- Sprint 8C.1 — formulaires officiels remplissables (DC1, DC2, DC4, ACTE_ENGAGEMENT/ATTRI1).
-- Migration additive : jamais une ancienne migration modifiée.

-- AlterTable
ALTER TABLE "administrative_document_revisions" ADD COLUMN "official_template_id" UUID;
ALTER TABLE "administrative_document_revisions" ADD COLUMN "form_data_snapshot" JSONB;

-- CreateTable
CREATE TABLE "official_administrative_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "document_type" VARCHAR(40) NOT NULL,
    "official_name" VARCHAR(300) NOT NULL,
    "version" INTEGER NOT NULL,
    "source_authority" VARCHAR(120) NOT NULL,
    "source_reference" VARCHAR(500) NOT NULL,
    "published_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_document_id" UUID NOT NULL,
    "file_document_version_id" UUID NOT NULL,
    "hash" VARCHAR(128) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_administrative_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_form_drafts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "scope_id" VARCHAR(80) NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_form_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_provided_form_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "designated_by" UUID NOT NULL,
    "designated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_provided_form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "official_administrative_templates_organization_id_documen_idx" ON "official_administrative_templates"("organization_id", "document_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_form_drafts_id_organization_id_key" ON "administrative_form_drafts"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_form_drafts_organization_id_tender_id_docum_key" ON "administrative_form_drafts"("organization_id", "tender_id", "document_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_provided_form_templates_id_organization_id_key" ON "buyer_provided_form_templates"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_provided_form_templates_organization_id_tender_id_do_key" ON "buyer_provided_form_templates"("organization_id", "tender_id", "document_type");

-- AddForeignKey
ALTER TABLE "administrative_form_drafts" ADD CONSTRAINT "administrative_form_drafts_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_provided_form_templates" ADD CONSTRAINT "buyer_provided_form_templates_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints (catalogue fermé — sous-ensemble "formulaire officiel" de AdministrativeDocumentType — hand-appended, jamais un enum natif Prisma)
ALTER TABLE "official_administrative_templates" ADD CONSTRAINT "official_administrative_templates_document_type_check" CHECK ("document_type" IN ('DC1','DC2','DC4','ACTE_ENGAGEMENT'));
ALTER TABLE "administrative_form_drafts" ADD CONSTRAINT "administrative_form_drafts_document_type_check" CHECK ("document_type" IN ('DC1','DC2','DC4','ACTE_ENGAGEMENT'));
ALTER TABLE "buyer_provided_form_templates" ADD CONSTRAINT "buyer_provided_form_templates_document_type_check" CHECK ("document_type" IN ('DC1','DC2','DC4','ACTE_ENGAGEMENT'));

-- Une seule ligne active par (organization_id, document_type) — filet de sécurité au niveau base,
-- l'atomicité réelle est garantie par l'application (transaction courte, même motif que
-- ExportTemplateVersion.activateAtomically). Index partiel séparé pour les gabarits système
-- (organization_id NULL) car Postgres traite chaque NULL comme distinct dans un index unique normal.
CREATE UNIQUE INDEX "official_administrative_templates_system_active_key" ON "official_administrative_templates" ("document_type") WHERE "active" = true AND "organization_id" IS NULL;
CREATE UNIQUE INDEX "official_administrative_templates_org_active_key" ON "official_administrative_templates" ("organization_id", "document_type") WHERE "active" = true AND "organization_id" IS NOT NULL;
