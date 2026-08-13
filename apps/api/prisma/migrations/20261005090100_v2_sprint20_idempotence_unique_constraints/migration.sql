-- Correctif audit Codex (P1-001) — contrainte DB en défense en profondeur, en complément du
-- verrou consultatif applicatif (`pg_advisory_xact_lock`, voir *RecordRepository.withLock) qui est
-- le mécanisme PRINCIPAL empêchant la duplication. Cette contrainte ne devrait jamais être
-- déclenchée en usage normal (le verrou sérialise déjà tout accès concurrent à la même clé) — elle
-- garantit qu'un bug futur dans la logique applicative ne peut, au pire, que faire échouer une
-- écriture plutôt que silencieusement dupliquer un Document/upload.

-- Import : `target_document_id` est nullable (import comme nouveau document vs. ajout de version à
-- un document ciblé explicitement, voir ExternalFileImportRecord) — Postgres traite NULL comme
-- distinct dans une contrainte UNIQUE classique, d'où deux index partiels (même motif déjà utilisé
-- par `external_connections_org_provider_active_uidx`, Sprint 19).
CREATE UNIQUE INDEX "external_file_import_records_key_null_target_uidx"
  ON "external_file_import_records"("connection_id", "remote_container_id", "remote_file_id")
  WHERE "target_document_id" IS NULL;

CREATE UNIQUE INDEX "external_file_import_records_key_target_uidx"
  ON "external_file_import_records"("connection_id", "remote_container_id", "remote_file_id", "target_document_id")
  WHERE "target_document_id" IS NOT NULL;

-- Export : toutes les colonnes de la clé de destination sont NOT NULL — une contrainte UNIQUE
-- classique suffit.
CREATE UNIQUE INDEX "external_file_export_records_destination_uidx"
  ON "external_file_export_records"("connection_id", "document_id", "document_version_id", "remote_container_id", "remote_folder_id", "filename");
