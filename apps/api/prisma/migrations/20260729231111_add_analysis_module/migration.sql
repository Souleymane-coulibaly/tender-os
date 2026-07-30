-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "dce_id" UUID,
    "document_id" UUID,
    "target_id" UUID NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "provider" VARCHAR(30),
    "model" VARCHAR(60),
    "analysis_version" INTEGER NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "extraction_version" INTEGER,
    "input_checksum" VARCHAR(64),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "result_summary" TEXT,
    "error_code" VARCHAR(60),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_attempts" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "trigger" VARCHAR(10) NOT NULL,
    "provider" VARCHAR(30),
    "model" VARCHAR(60),
    "outcome" VARCHAR(20) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "error_code" VARCHAR(60),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_jobs_organization_id_target_id_status_idx" ON "analysis_jobs"("organization_id", "target_id", "status");

-- CreateIndex
CREATE INDEX "analysis_jobs_organization_id_status_idx" ON "analysis_jobs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_organization_id_scope_target_id_analysis_vers_key" ON "analysis_jobs"("organization_id", "scope", "target_id", "analysis_version");

-- CreateIndex
CREATE INDEX "analysis_attempts_organization_id_job_id_idx" ON "analysis_attempts"("organization_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_attempts_job_id_attempt_number_key" ON "analysis_attempts"("job_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_dce_id_organization_id_fkey" FOREIGN KEY ("dce_id", "organization_id") REFERENCES "dces"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_attempts" ADD CONSTRAINT "analysis_attempts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (mission Sprint 4.1 — même motif que la correction P1-05, module Extraction) :
-- protège au niveau PostgreSQL les valeurs fermées déjà validées côté domaine (scope, statut,
-- trigger, outcome) et la cohérence scope/cible, dès la création de ces tables — jamais reporté à
-- une migration corrective ultérieure comme ce fut le cas pour Extraction. Colonnes VARCHAR
-- ordinaires côté Prisma (jamais un type enum PostgreSQL natif), même motif que
-- document_extractions/extraction_attempts : reste cohérent avec le reste du schéma, évite la
-- rigidité d'ALTER TYPE lors d'un futur ajout de valeur.

ALTER TABLE "analysis_jobs"
  ADD CONSTRAINT "analysis_jobs_scope_check"
  CHECK ("scope" IN ('DOCUMENT', 'TENDER'));

ALTER TABLE "analysis_jobs"
  ADD CONSTRAINT "analysis_jobs_status_check"
  CHECK ("status" IN ('PENDING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'CANCELLED'));

-- Cohérence scope ↔ cible : un job DOCUMENT porte toujours document_id/dce_id et target_id =
-- document_id ; un job TENDER ne porte jamais document_id/dce_id et target_id = tender_id. Jamais
-- uniquement une garantie applicative : un bug ou un accès direct à la base ne peut plus produire
-- un job DOCUMENT sans document, ni un target_id incohérent avec sa propre cible.
ALTER TABLE "analysis_jobs"
  ADD CONSTRAINT "analysis_jobs_scope_target_check"
  CHECK (
    ("scope" = 'DOCUMENT' AND "document_id" IS NOT NULL AND "dce_id" IS NOT NULL AND "target_id" = "document_id")
    OR
    ("scope" = 'TENDER' AND "document_id" IS NULL AND "dce_id" IS NULL AND "target_id" = "tender_id")
  );

ALTER TABLE "analysis_attempts"
  ADD CONSTRAINT "analysis_attempts_trigger_check"
  CHECK ("trigger" IN ('MANUAL', 'RETRY', 'SYSTEM'));

ALTER TABLE "analysis_attempts"
  ADD CONSTRAINT "analysis_attempts_outcome_check"
  CHECK ("outcome" IN ('SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED'));
