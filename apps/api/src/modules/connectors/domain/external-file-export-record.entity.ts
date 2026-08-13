export const ExternalFileExportRecordStatus = {
  Pending: "PENDING",
  Succeeded: "SUCCEEDED",
  /** Correctif audit Codex (P1-003) — l'upload a échoué APRÈS que la requête ait potentiellement
   *  atteint le provider (timeout/connexion perdue, jamais un statut HTTP reçu positivement en
   *  échec) : le fichier distant a peut-être été créé malgré tout. Bloque volontairement tout
   *  nouvel essai automatique vers cette MÊME destination (`ExternalFileExportNeedsReconciliationError`,
   *  jamais une reprise silencieuse qui risquerait de dupliquer un fichier déjà créé). */
  NeedsReconciliation: "NEEDS_RECONCILIATION",
} as const;
export type ExternalFileExportRecordStatus = (typeof ExternalFileExportRecordStatus)[keyof typeof ExternalFileExportRecordStatus];

export type ExternalFileExportRecordProps = {
  id: string;
  organizationId: string;
  connectionId: string;
  documentId: string;
  documentVersionId: string;
  remoteContainerId: string;
  remoteFolderId: string;
  filename: string;
  status: ExternalFileExportRecordStatus;
  /** Instantané complet du `RemoteFile` obtenu lors de l'upload réussi — `undefined` tant que
   *  `status === PENDING`, permet de répondre à une relecture idempotente SANS second appel
   *  provider une fois `SUCCEEDED` (aucune méthode "métadonnées d'un fichier distant" n'existe sur
   *  `ConnectorProviderAdapter`, mission §1 : forme commune minimale navigation + fichiers +
   *  calendrier). */
  remoteFileId?: string | undefined;
  remoteFileMimeType?: string | undefined;
  remoteFileSizeBytes?: number | undefined;
  remoteFileModifiedAt?: Date | undefined;
  remoteFileETag?: string | undefined;
  remoteFileWebUrl?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mission §27 (POINT MAJEUR DU SPRINT) — trace d'un export réussi vers une destination précise :
 * (DocumentVersion, connexion, container, dossier, nom de fichier). Un export retenté après une
 * réponse perdue (timeout réseau côté TenderOS alors que l'upload provider a en réalité réussi) sur
 * la MÊME cible exacte réutilise le `RemoteFile` déjà obtenu, jamais un second upload créant une
 * copie distante non maîtrisée. Un export vers une destination différente (autre dossier, autre
 * nom) reste un export distinct, jamais bloqué par cette garde.
 *
 * Correctif audit Codex (P1-002) — `status` matérialise une RÉSERVATION posée sous verrou COURT
 * (`reserve()`), AVANT l'appel provider (`adapter.uploadFile`, potentiellement lent — jamais un
 * verrou consultatif Postgres tenu pendant un appel réseau externe, voir
 * `ExportDocumentVersionUseCase`). Les champs `remoteFile*` ne sont connus qu'après
 * `markSucceeded()`.
 */
export class ExternalFileExportRecord {
  private constructor(private props: ExternalFileExportRecordProps) {}

  /** Pose une réservation PENDING — l'upload provider n'a pas encore eu lieu. */
  static reserve(input: {
    id: string;
    organizationId: string;
    connectionId: string;
    documentId: string;
    documentVersionId: string;
    remoteContainerId: string;
    remoteFolderId: string;
    filename: string;
    occurredAt: Date;
  }): ExternalFileExportRecord {
    return new ExternalFileExportRecord({
      id: input.id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      remoteContainerId: input.remoteContainerId,
      remoteFolderId: input.remoteFolderId,
      filename: input.filename,
      status: ExternalFileExportRecordStatus.Pending,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExternalFileExportRecordProps): ExternalFileExportRecord {
    return new ExternalFileExportRecord(props);
  }

  markSucceeded(input: {
    remoteFileId: string;
    remoteFileMimeType: string;
    remoteFileSizeBytes: number;
    remoteFileModifiedAt: Date;
    remoteFileETag?: string | undefined;
    remoteFileWebUrl?: string | undefined;
    occurredAt: Date;
  }): void {
    this.props.status = ExternalFileExportRecordStatus.Succeeded;
    this.props.remoteFileId = input.remoteFileId;
    this.props.remoteFileMimeType = input.remoteFileMimeType;
    this.props.remoteFileSizeBytes = input.remoteFileSizeBytes;
    this.props.remoteFileModifiedAt = input.remoteFileModifiedAt;
    this.props.remoteFileETag = input.remoteFileETag;
    this.props.remoteFileWebUrl = input.remoteFileWebUrl;
    this.props.updatedAt = input.occurredAt;
  }

  /** Reprend une réservation PENDING périmée (voir `isStalePending`) pour un nouvel essai. */
  reopen(occurredAt: Date): void {
    this.props.status = ExternalFileExportRecordStatus.Pending;
    this.props.updatedAt = occurredAt;
  }

  /** Correctif audit Codex (P1-003) — l'upload a échoué de façon AMBIGUË (voir
   *  `RemoteProviderError.isAmbiguousOutcome`) : ne jamais supprimer la réservation (contrairement à
   *  un échec définitif), la marquer plutôt comme nécessitant une vérification manuelle. */
  markNeedsReconciliation(occurredAt: Date): void {
    this.props.status = ExternalFileExportRecordStatus.NeedsReconciliation;
    this.props.updatedAt = occurredAt;
  }

  isSucceeded(): boolean {
    return this.props.status === ExternalFileExportRecordStatus.Succeeded;
  }

  needsReconciliation(): boolean {
    return this.props.status === ExternalFileExportRecordStatus.NeedsReconciliation;
  }

  /** Correctif audit Codex (P1-002), résidu documenté — même motif que
   *  `ExternalFileImportRecord.isStalePending` : filet de sécurité minimal contre une réservation
   *  PENDING abandonnée par un crash process, jamais un lease/job-engine complet (hors périmètre). */
  isStalePending(now: Date, thresholdMs: number): boolean {
    return this.props.status === ExternalFileExportRecordStatus.Pending && now.getTime() - this.props.updatedAt.getTime() > thresholdMs;
  }

  /** Reconstruit le `RemoteFile` tel qu'obtenu lors de l'upload d'origine — jamais un second appel
   *  provider pour répondre à une relecture idempotente. Lève si appelé avant `markSucceeded()`. */
  toRemoteFile(): { id: string; name: string; mimeType: string; sizeBytes: number; modifiedAt: Date; eTag?: string | undefined; webUrl?: string | undefined } {
    if (!this.isSucceeded() || this.props.remoteFileId === undefined || this.props.remoteFileMimeType === undefined || this.props.remoteFileSizeBytes === undefined || this.props.remoteFileModifiedAt === undefined) {
      throw new Error("toRemoteFile() called on a PENDING ExternalFileExportRecord — call markSucceeded() first.");
    }
    return {
      id: this.props.remoteFileId,
      name: this.props.filename,
      mimeType: this.props.remoteFileMimeType,
      sizeBytes: this.props.remoteFileSizeBytes,
      modifiedAt: this.props.remoteFileModifiedAt,
      eTag: this.props.remoteFileETag,
      webUrl: this.props.remoteFileWebUrl,
    };
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
  get documentId(): string {
    return this.props.documentId;
  }
  get documentVersionId(): string {
    return this.props.documentVersionId;
  }
  get remoteContainerId(): string {
    return this.props.remoteContainerId;
  }
  get remoteFolderId(): string {
    return this.props.remoteFolderId;
  }
  get filename(): string {
    return this.props.filename;
  }
  get status(): ExternalFileExportRecordStatus {
    return this.props.status;
  }
  get remoteFileId(): string | undefined {
    return this.props.remoteFileId;
  }
  get remoteFileMimeType(): string | undefined {
    return this.props.remoteFileMimeType;
  }
  get remoteFileSizeBytes(): number | undefined {
    return this.props.remoteFileSizeBytes;
  }
  get remoteFileModifiedAt(): Date | undefined {
    return this.props.remoteFileModifiedAt;
  }
  get remoteFileETag(): string | undefined {
    return this.props.remoteFileETag;
  }
  get remoteFileWebUrl(): string | undefined {
    return this.props.remoteFileWebUrl;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
