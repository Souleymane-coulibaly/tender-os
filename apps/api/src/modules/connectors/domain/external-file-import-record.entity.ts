export const ExternalFileImportRecordStatus = { Pending: "PENDING", Succeeded: "SUCCEEDED" } as const;
export type ExternalFileImportRecordStatus = (typeof ExternalFileImportRecordStatus)[keyof typeof ExternalFileImportRecordStatus];

export type ExternalFileImportRecordProps = {
  id: string;
  organizationId: string;
  connectionId: string;
  remoteContainerId: string;
  remoteFileId: string;
  /** `undefined` = importé comme un NOUVEAU document (jamais confondu avec un ajout de version à
   *  un document ciblé explicitement — les deux sont des opérations distinctes, mission §26). */
  targetDocumentId?: string | undefined;
  contentChecksum: string;
  status: ExternalFileImportRecordStatus;
  /** `undefined` tant que `status === PENDING` — connus seulement une fois le traitement terminé. */
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mission §26 (POINT MAJEUR DU SPRINT) — trace du dernier import réussi pour un fichier distant
 * précis, garde d'idempotence : un import automatique/retenté du MÊME fichier distant, avec un
 * contenu STRICTEMENT IDENTIQUE (checksum SHA-256), ne crée jamais une seconde DocumentVersion —
 * l'appelant réutilise le `documentId`/`documentVersionId` déjà produits. Un contenu qui a
 * réellement changé côté provider (checksum différent) produit en revanche une nouvelle version
 * légitime : ceci n'est jamais un blocage permanent, seulement une déduplication du strict doublon.
 *
 * Correctif audit Codex (P1-002) — `status` matérialise une RÉSERVATION posée sous verrou COURT
 * (`reserve()`), AVANT tout traitement lent (création Document, écriture StorageProvider) : le
 * verrou consultatif Postgres n'est jamais tenu pendant ce traitement (voir
 * `ImportRemoteFileUseCase`), seulement pendant la décision "personne d'autre ne traite déjà cette
 * clé". `documentId`/`documentVersionId` ne sont connus qu'après `markSucceeded()`.
 */
export class ExternalFileImportRecord {
  private constructor(private props: ExternalFileImportRecordProps) {}

  /** Pose une réservation PENDING — le traitement lent n'a pas encore eu lieu. */
  static reserve(input: {
    id: string;
    organizationId: string;
    connectionId: string;
    remoteContainerId: string;
    remoteFileId: string;
    targetDocumentId?: string | undefined;
    contentChecksum: string;
    occurredAt: Date;
  }): ExternalFileImportRecord {
    return new ExternalFileImportRecord({
      id: input.id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      remoteContainerId: input.remoteContainerId,
      remoteFileId: input.remoteFileId,
      targetDocumentId: input.targetDocumentId,
      contentChecksum: input.contentChecksum,
      status: ExternalFileImportRecordStatus.Pending,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExternalFileImportRecordProps): ExternalFileImportRecord {
    return new ExternalFileImportRecord(props);
  }

  markSucceeded(input: { documentId: string; documentVersionId: string; contentChecksum: string; occurredAt: Date }): void {
    this.props.status = ExternalFileImportRecordStatus.Succeeded;
    this.props.documentId = input.documentId;
    this.props.documentVersionId = input.documentVersionId;
    this.props.contentChecksum = input.contentChecksum;
    this.props.updatedAt = input.occurredAt;
  }

  /** Reprend une réservation existante pour un nouveau traitement — contenu changé sur un import
   *  déjà réussi, ou reprise d'une réservation PENDING périmée (voir `isStalePending`). */
  reopen(input: { contentChecksum: string; occurredAt: Date }): void {
    this.props.status = ExternalFileImportRecordStatus.Pending;
    this.props.contentChecksum = input.contentChecksum;
    this.props.updatedAt = input.occurredAt;
  }

  isSucceeded(): boolean {
    return this.props.status === ExternalFileImportRecordStatus.Succeeded;
  }

  matchesChecksum(checksum: string): boolean {
    return this.props.contentChecksum === checksum;
  }

  /** Correctif audit Codex (P1-002), résidu documenté — jamais de lease/job-engine complet ce
   *  sprint (architecture synchrone, hors périmètre, mission §28-31 confirmé non applicable) :
   *  seulement ce filet de sécurité minimal. Une réservation PENDING plus vieille que `thresholdMs`
   *  signale un traitement précédent mort sans avoir jamais finalisé (crash process) — elle peut
   *  être reprise, jamais laissée bloquer indéfiniment un import ultérieur. */
  isStalePending(now: Date, thresholdMs: number): boolean {
    return this.props.status === ExternalFileImportRecordStatus.Pending && now.getTime() - this.props.updatedAt.getTime() > thresholdMs;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get connectionId(): string {
    return this.props.connectionId;
  }
  get remoteContainerId(): string {
    return this.props.remoteContainerId;
  }
  get remoteFileId(): string {
    return this.props.remoteFileId;
  }
  get targetDocumentId(): string | undefined {
    return this.props.targetDocumentId;
  }
  get contentChecksum(): string {
    return this.props.contentChecksum;
  }
  get status(): ExternalFileImportRecordStatus {
    return this.props.status;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
