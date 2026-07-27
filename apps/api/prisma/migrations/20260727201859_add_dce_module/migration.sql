-- CreateTable
CREATE TABLE "dces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dce_documents" (
    "dce_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "dces_organization_id_idx" ON "dces"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dces_tender_id_key" ON "dces"("tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "dces_id_organization_id_key" ON "dces"("id", "organization_id");

-- CreateIndex
CREATE INDEX "dce_documents_organization_id_dce_id_idx" ON "dce_documents"("organization_id", "dce_id");

-- CreateIndex
CREATE INDEX "dce_documents_organization_id_document_id_idx" ON "dce_documents"("organization_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "dce_documents_dce_id_document_id_key" ON "dce_documents"("dce_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_id_organization_id_key" ON "documents"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "dces" ADD CONSTRAINT "dces_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dce_documents" ADD CONSTRAINT "dce_documents_dce_id_organization_id_fkey" FOREIGN KEY ("dce_id", "organization_id") REFERENCES "dces"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dce_documents" ADD CONSTRAINT "dce_documents_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

