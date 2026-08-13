import type { ExternalFileExportRecord } from "../../domain/external-file-export-record.entity";

export interface ExternalFileExportRecordRepository {
  findByDestination(input: { organizationId: string; connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }): Promise<ExternalFileExportRecord | null>;
  save(record: ExternalFileExportRecord): Promise<void>;
  /** Nettoyage best-effort d'une réservation PENDING abandonnée après un échec de l'upload provider
   *  (mission Codex P1-002) — jamais appelé sur une ligne SUCCEEDED. */
  delete(id: string): Promise<void>;
  /** Correctif audit Codex (P1-001) — même motif que `ExternalFileImportRecordRepository.withLock` :
   *  sans verrou, deux exports concurrents vers la MÊME destination peuvent tous deux uploader vers
   *  le provider avant qu'aucun n'ait persisté de trace, créant deux fichiers distants au lieu d'un.
   *  Scopé à la destination exacte — deux exports vers des destinations DIFFÉRENTES restent
   *  parallèles.
   *
   *  Correctif audit Codex (P1-002) — `fn` doit rester COURT (uniquement lecture + réservation),
   *  JAMAIS envelopper l'appel provider (`adapter.uploadFile`, potentiellement lent) : ce verrou
   *  tient une transaction Postgres ouverte pendant toute la durée de `fn`, qui ne doit donc jamais
   *  inclure d'appel réseau externe (voir `ExportDocumentVersionUseCase`). */
  withLock<T>(key: { connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }, fn: () => Promise<T>): Promise<T>;
}

export const EXTERNAL_FILE_EXPORT_RECORD_REPOSITORY = Symbol("EXTERNAL_FILE_EXPORT_RECORD_REPOSITORY");
