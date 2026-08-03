-- CreateTable
CREATE TABLE "dce_import_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    "original_filename" VARCHAR(255) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "total_files" INTEGER,
    "accepted_count" INTEGER,
    "rejected_count" INTEGER,
    "result" JSONB,
    "error_message" VARCHAR(2000),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "dce_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dce_import_jobs_id_organization_id_key" ON "dce_import_jobs"("id", "organization_id");

-- CreateIndex
CREATE INDEX "dce_import_jobs_organization_id_tender_id_idx" ON "dce_import_jobs"("organization_id", "tender_id");

-- AddForeignKey
ALTER TABLE "dce_import_jobs" ADD CONSTRAINT "dce_import_jobs_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraint (même motif que le reste du schéma — jamais une chaîne libre non contrôlée).
ALTER TABLE "dce_import_jobs" ADD CONSTRAINT "dce_import_jobs_status_check" CHECK ("status" IN ('CREATED', 'EXTRACTING', 'IMPORTING', 'READY', 'PARTIALLY_READY', 'FAILED', 'CANCELLED'));
