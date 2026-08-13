-- Correctif audit Codex (P1-002) — la trace d'idempotence devient une RÉSERVATION (PENDING avant
-- traitement lent, SUCCEEDED une fois terminé) posée sous verrou COURT, jamais un verrou tenu
-- pendant l'appel provider/StorageProvider. Les colonnes de résultat deviennent inconnues (NULL)
-- tant que PENDING.

-- AlterTable: external_file_import_records
ALTER TABLE "external_file_import_records"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ALTER COLUMN "document_id" DROP NOT NULL,
  ALTER COLUMN "document_version_id" DROP NOT NULL;

-- Les lignes déjà présentes avant ce correctif ont nécessairement abouti (aucune réservation
-- PENDING n'existait avant l'introduction de ce statut) : marquées SUCCEEDED explicitement, jamais
-- laissées PENDING par erreur.
UPDATE "external_file_import_records" SET "status" = 'SUCCEEDED';

-- AlterTable: external_file_export_records
ALTER TABLE "external_file_export_records"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "updated_at" TIMESTAMP(3),
  ALTER COLUMN "remote_file_id" DROP NOT NULL,
  ALTER COLUMN "remote_file_mime_type" DROP NOT NULL,
  ALTER COLUMN "remote_file_size_bytes" DROP NOT NULL,
  ALTER COLUMN "remote_file_modified_at" DROP NOT NULL;

UPDATE "external_file_export_records" SET "status" = 'SUCCEEDED', "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "external_file_export_records" ALTER COLUMN "updated_at" SET NOT NULL;
