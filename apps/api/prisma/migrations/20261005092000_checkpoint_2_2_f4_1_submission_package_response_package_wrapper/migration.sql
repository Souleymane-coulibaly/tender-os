-- Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — SubmissionPackage devient un WRAPPER opérationnel
-- du PackageArtifact V2, jamais un second moteur de reconstruction du contenu métier. Migration
-- additive uniquement : aucun DROP, aucun renommage destructif, aucun backfill inventé.

-- AlterTable — provenance V2 explicite (NULL pour tout package antérieur à ce checkpoint, jamais
-- fabriquée rétroactivement).
ALTER TABLE "submission_packages" ADD COLUMN "response_package_version_id" UUID;
ALTER TABLE "submission_packages" ADD COLUMN "response_package_artifact_id" UUID;
ALTER TABLE "submission_packages" ADD COLUMN "response_package_artifact_checksum" VARCHAR(64);

CREATE INDEX "submission_packages_organization_id_response_package_version_id_idx" ON "submission_packages"("organization_id", "response_package_version_id");

-- AlterTable — RESPONSE_PACKAGE_ARTIFACT (25 caractères) dépasse VARCHAR(24).
ALTER TABLE "package_files" ALTER COLUMN "source_type" TYPE VARCHAR(30);

-- CheckConstraints (catalogue fermé, hand-appended, jamais un enum natif Prisma) — ajoute
-- RESPONSE_PACKAGE_ARTIFACT, seule nouvelle valeur.
ALTER TABLE "package_files" DROP CONSTRAINT "package_files_source_type_check";
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_source_type_check" CHECK ("source_type" IN ('EXPORT_ARTIFACT','SIGNATURE_ARTIFACT','MANIFEST','ADMINISTRATIVE_DOCUMENT','RESPONSE_PACKAGE_ARTIFACT'));
