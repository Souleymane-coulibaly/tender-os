-- CreateTable
CREATE TABLE "pricing_schedule_final_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pricing_schedule_version_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "injected_cell_count" INTEGER NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_schedule_final_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_schedule_final_files_id_organization_id_key" ON "pricing_schedule_final_files"("id", "organization_id");
CREATE INDEX "pricing_schedule_final_files_organization_id_version_id_idx" ON "pricing_schedule_final_files"("organization_id", "pricing_schedule_version_id");

-- AddForeignKey
ALTER TABLE "pricing_schedule_final_files" ADD CONSTRAINT "pricing_schedule_final_files_version_id_organization_id_fkey" FOREIGN KEY ("pricing_schedule_version_id", "organization_id") REFERENCES "pricing_schedule_versions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
