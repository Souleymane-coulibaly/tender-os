-- CreateTable
CREATE TABLE "external_file_import_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "remote_container_id" VARCHAR(300) NOT NULL,
    "remote_file_id" VARCHAR(300) NOT NULL,
    "target_document_id" UUID,
    "content_checksum" VARCHAR(64) NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_file_import_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_file_export_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "remote_container_id" VARCHAR(300) NOT NULL,
    "remote_folder_id" VARCHAR(300) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "remote_file_id" VARCHAR(300) NOT NULL,
    "remote_file_mime_type" VARCHAR(160) NOT NULL,
    "remote_file_size_bytes" INTEGER NOT NULL,
    "remote_file_modified_at" TIMESTAMP(3) NOT NULL,
    "remote_file_etag" VARCHAR(300),
    "remote_file_web_url" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_file_export_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_file_import_records_organization_id_connection_id__idx" ON "external_file_import_records"("organization_id", "connection_id", "remote_container_id", "remote_file_id", "target_document_id");

-- CreateIndex
CREATE INDEX "external_file_export_records_organization_id_connection_id__idx" ON "external_file_export_records"("organization_id", "connection_id", "document_version_id", "remote_container_id", "remote_folder_id", "filename");

-- AddForeignKey
ALTER TABLE "external_file_import_records" ADD CONSTRAINT "external_file_import_records_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "external_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_file_export_records" ADD CONSTRAINT "external_file_export_records_connection_id_organization_id_fkey" FOREIGN KEY ("connection_id", "organization_id") REFERENCES "external_connections"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
