-- CreateTable
CREATE TABLE "document_extractions" (
    "document_id" UUID NOT NULL,
    "dce_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "strategy" VARCHAR(20),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "page_count" INTEGER,
    "character_count" INTEGER,
    "chunk_count" INTEGER,
    "language" VARCHAR(8),
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_error" TEXT,
    "content_checksum" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "extraction_attempts" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "strategy" VARCHAR(20) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "provider" VARCHAR(60),
    "provider_version" VARCHAR(30),
    "provider_request_id" VARCHAR(120),
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "page_count" INTEGER,
    "character_count" INTEGER,
    "chunk_count" INTEGER,
    "language" VARCHAR(8),
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_code" VARCHAR(60),
    "error_message" TEXT,

    CONSTRAINT "extraction_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "content" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "token_estimate" INTEGER,
    "checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_extractions_organization_id_dce_id_idx" ON "document_extractions"("organization_id", "dce_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_extractions_document_id_organization_id_key" ON "document_extractions"("document_id", "organization_id");

-- CreateIndex
CREATE INDEX "extraction_attempts_organization_id_document_id_idx" ON "extraction_attempts"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "extraction_chunks_organization_id_document_id_idx" ON "extraction_chunks"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_chunks_document_id_sequence_key" ON "extraction_chunks"("document_id", "sequence");

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_dce_id_organization_id_fkey" FOREIGN KEY ("dce_id", "organization_id") REFERENCES "dces"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_attempts" ADD CONSTRAINT "extraction_attempts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document_extractions"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_chunks" ADD CONSTRAINT "extraction_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document_extractions"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
