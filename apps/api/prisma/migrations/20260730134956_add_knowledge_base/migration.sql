-- CreateTable
CREATE TABLE "knowledge_spaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_space_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "language" VARCHAR(8),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "active_version_number" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entry_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_entry_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_entry_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_entry_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "language" VARCHAR(8),
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_entry_id" UUID NOT NULL,
    "knowledge_document_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "content" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "token_estimate" INTEGER,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "display_label" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entry_tags" (
    "organization_id" UUID NOT NULL,
    "knowledge_entry_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_entry_tags_pkey" PRIMARY KEY ("knowledge_entry_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_spaces_organization_id_name_key" ON "knowledge_spaces"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_spaces_id_organization_id_key" ON "knowledge_spaces"("id", "organization_id");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_status_idx" ON "knowledge_entries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_category_idx" ON "knowledge_entries"("organization_id", "category");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_created_at_idx" ON "knowledge_entries"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_archived_at_idx" ON "knowledge_entries"("organization_id", "archived_at");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_title_idx" ON "knowledge_entries"("organization_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_entries_id_organization_id_key" ON "knowledge_entries"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_entry_versions_organization_id_knowledge_entry_id_key" ON "knowledge_entry_versions"("organization_id", "knowledge_entry_id", "version_number");

-- CreateIndex
CREATE INDEX "knowledge_documents_organization_id_knowledge_entry_id_idx" ON "knowledge_documents"("organization_id", "knowledge_entry_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_organization_id_document_id_idx" ON "knowledge_documents"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_id_organization_id_key" ON "knowledge_documents"("id", "organization_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_organization_id_knowledge_entry_id_idx" ON "knowledge_chunks"("organization_id", "knowledge_entry_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_organization_id_knowledge_document_id_sequ_idx" ON "knowledge_chunks"("organization_id", "knowledge_document_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_tags_organization_id_label_key" ON "knowledge_tags"("organization_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_tags_id_organization_id_key" ON "knowledge_tags"("id", "organization_id");

-- CreateIndex
CREATE INDEX "knowledge_entry_tags_organization_id_tag_id_idx" ON "knowledge_entry_tags"("organization_id", "tag_id");

-- AddForeignKey
ALTER TABLE "knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_knowledge_space_id_organization_id_fkey" FOREIGN KEY ("knowledge_space_id", "organization_id") REFERENCES "knowledge_spaces"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entry_versions" ADD CONSTRAINT "knowledge_entry_versions_knowledge_entry_id_organization_i_fkey" FOREIGN KEY ("knowledge_entry_id", "organization_id") REFERENCES "knowledge_entries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_entry_id_organization_id_fkey" FOREIGN KEY ("knowledge_entry_id", "organization_id") REFERENCES "knowledge_entries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_document_id_organization_id_fkey" FOREIGN KEY ("knowledge_document_id", "organization_id") REFERENCES "knowledge_documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entry_tags" ADD CONSTRAINT "knowledge_entry_tags_knowledge_entry_id_organization_id_fkey" FOREIGN KEY ("knowledge_entry_id", "organization_id") REFERENCES "knowledge_entries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entry_tags" ADD CONSTRAINT "knowledge_entry_tags_tag_id_organization_id_fkey" FOREIGN KEY ("tag_id", "organization_id") REFERENCES "knowledge_tags"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (mission Sprint 5 §3/§2/§6 — même motif que les corrections P1-05/Sprint 4.2 :
-- une valeur textuelle stockée dans une colonne VARCHAR doit toujours être bornée par une
-- énumération réelle, jamais une chaîne libre non contrôlée, même si le domaine/l'application la
-- valide déjà avant persistance).

ALTER TABLE "knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_status_check"
  CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_category_check"
  CHECK ("category" IN (
    'COMPANY_PRESENTATION', 'CLIENT_REFERENCE', 'CONSULTANT_PROFILE', 'CERTIFICATION', 'METHODOLOGY',
    'SERVICE_OFFER', 'CASE_STUDY', 'SECURITY', 'GDPR', 'CSR', 'ADMINISTRATIVE', 'TECHNICAL_MEMORY',
    'RESPONSE_TEMPLATE', 'COMMERCIAL_DOCUMENT', 'OTHER'
  ));

ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_source_type_check"
  CHECK ("source_type" IN ('MANUAL', 'DOCUMENT_IMPORT'));

ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_status_check"
  CHECK ("status" IN ('DRAFT', 'PROCESSING', 'READY', 'PARTIALLY_READY', 'FAILED', 'ARCHIVED'));

ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_status_check"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'READY', 'PARTIALLY_READY', 'FAILED'));

-- Cohérence version/traitement (mission §10 "modification substantielle") — jamais un compteur
-- négatif ou nul.
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_active_version_number_check"
  CHECK ("active_version_number" >= 1);

ALTER TABLE "knowledge_entry_versions" ADD CONSTRAINT "knowledge_entry_versions_version_number_check"
  CHECK ("version_number" >= 1);

ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_version_number_check"
  CHECK ("version_number" >= 1);

ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_attempt_count_check"
  CHECK ("attempt_count" >= 0);
