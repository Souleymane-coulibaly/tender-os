-- AlterTable
ALTER TABLE "export_jobs" ADD COLUMN "theme_version_id" UUID;
ALTER TABLE "export_jobs" ADD COLUMN "theme_source_level" VARCHAR(12);

-- CHECK constraint (même motif que "deliverables_theme_source_level_check").
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_theme_source_level_check" CHECK ("theme_source_level" IS NULL OR "theme_source_level" IN ('TENDER','CLIENT','ORGANIZATION','TENDEROS'));
