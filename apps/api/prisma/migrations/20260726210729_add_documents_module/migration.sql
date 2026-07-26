-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "origin" VARCHAR(30) NOT NULL,
    "domain" VARCHAR(30) NOT NULL,
    "category" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL,
    "current_version_id" UUID,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "sanitized_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "extension" VARCHAR(20) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tender_associations" (
    "document_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "documents_organization_id_status_idx" ON "documents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "documents_organization_id_domain_idx" ON "documents"("organization_id", "domain");

-- CreateIndex
CREATE INDEX "documents_organization_id_origin_idx" ON "documents"("organization_id", "origin");

-- CreateIndex
CREATE INDEX "documents_organization_id_created_at_idx" ON "documents"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "documents_organization_id_created_by_user_id_idx" ON "documents"("organization_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "document_versions_document_id_checksum_idx" ON "document_versions"("document_id", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "document_tender_associations_organization_id_tender_id_idx" ON "document_tender_associations"("organization_id", "tender_id");

-- CreateIndex
CREATE INDEX "document_tender_associations_organization_id_document_id_idx" ON "document_tender_associations"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_tender_associations_document_id_tender_id_key" ON "document_tender_associations"("document_id", "tender_id");

-- AddForeignKey
ALTER TABLE "tender_requested_documents" ADD CONSTRAINT "tender_requested_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tender_associations" ADD CONSTRAINT "document_tender_associations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tender_associations" ADD CONSTRAINT "document_tender_associations_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
