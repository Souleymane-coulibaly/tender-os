import type { ExternalFileImportRecord } from "../../domain/external-file-import-record.entity";

export interface ExternalFileImportRecordRepository {
  findByRemoteFile(input: { organizationId: string; connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }): Promise<ExternalFileImportRecord | null>;
  save(record: ExternalFileImportRecord): Promise<void>;
  /** Nettoyage best-effort d'une réservation PENDING abandonnée après un échec du traitement lent
   *  (mission Codex P1-002) — jamais appelé sur une ligne SUCCEEDED. */
  delete(id: string): Promise<void>;
  /** Correctif audit Codex (P1-001) — un verrou consultatif Postgres seul basé sur `save()` en fin
   *  de séquence ne suffit pas : deux imports concurrents du MÊME fichier distant peuvent tous deux
   *  passer `findByRemoteFile` (aucune trace encore écrite) avant qu'aucun n'ait persisté, chacun
   *  créant alors son propre Document. `withLock` sérialise la décision "réserver ou réutiliser" pour
   *  une clé d'idempotence donnée. Le verrou est scopé à la clé d'idempotence (jamais à la connexion
   *  entière) : deux imports de fichiers DIFFÉRENTS sur la même connexion restent parallèles.
   *
   *  Correctif audit Codex (P1-002) — `fn` doit rester COURT (uniquement lecture + réservation),
   *  JAMAIS envelopper le traitement lent (création Document, écriture StorageProvider) : ce verrou
   *  tient une transaction Postgres ouverte pendant toute la durée de `fn`, qui ne doit donc jamais
   *  inclure un appel réseau externe (voir `ImportRemoteFileUseCase`, qui appelle `withLock`
   *  uniquement autour de la décision réserver-ou-réutiliser, jamais autour de la création du
   *  Document elle-même). */
  withLock<T>(key: { connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }, fn: () => Promise<T>): Promise<T>;
}

export const EXTERNAL_FILE_IMPORT_RECORD_REPOSITORY = Symbol("EXTERNAL_FILE_IMPORT_RECORD_REPOSITORY");
