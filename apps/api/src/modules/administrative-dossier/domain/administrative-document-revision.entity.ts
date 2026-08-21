import { AdministrativeDocumentRevisionStatus, assertAdministrativeDocumentRevisionStatusTransition } from "./administrative-document-revision-status";
import { ImmutableAdministrativeDocumentRevisionError } from "./errors";

export type AdministrativeDocumentRevisionProps = {
  id: string;
  organizationId: string;
  administrativeDocumentId: string;
  revisionNumber: number;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  expiresAt?: Date | undefined;
  status: AdministrativeDocumentRevisionStatus;
  notes?: string | undefined;
  /** Sprint 8C.1 — dénormalisés en LECTURE SEULE : quel gabarit officiel (`OfficialAdministrativeTemplate`)
   *  et quelles valeurs exactes ont produit cette révision, jamais posés pour une révision qui n'est
   *  pas un formulaire officiel généré (mission §9 "jamais régénérer une ancienne révision avec les
   *  données actuelles"). */
  officialTemplateId?: string | undefined;
  formDataSnapshot?: Record<string, unknown> | undefined;
  /** Checkpoint TENDEROS-2.1-P2.2-F3 — CandidateCompany effectif du Tender au moment où cette
   *  révision a été créée (générée OU déposée manuellement), dénormalisé en LECTURE SEULE, jamais
   *  recalculé après coup. `undefined` pour toute révision antérieure à ce checkpoint ou pour un
   *  Tender sans CandidateCompany résolu au moment de l'attachement — jamais deviné/backfillé. */
  candidateCompanyId?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 1 — mission §21 : chaque pièce administrative a des révisions, une ancienne
 * révision n'est jamais écrasée. Une révision peut exister vide (`documentId` absent, statut DRAFT)
 * avant qu'un fichier vérifié y soit attaché (mission §4 "un document laissé vide avant qu'un
 * fichier y soit attaché").
 */
export class AdministrativeDocumentRevision {
  private constructor(private props: AdministrativeDocumentRevisionProps) {}

  static create(input: { id: string; organizationId: string; administrativeDocumentId: string; revisionNumber: number; createdBy: string; occurredAt: Date }): AdministrativeDocumentRevision {
    return new AdministrativeDocumentRevision({
      id: input.id,
      organizationId: input.organizationId,
      administrativeDocumentId: input.administrativeDocumentId,
      revisionNumber: input.revisionNumber,
      status: AdministrativeDocumentRevisionStatus.Draft,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AdministrativeDocumentRevisionProps): AdministrativeDocumentRevision {
    return new AdministrativeDocumentRevision(props);
  }

  get hasAttachedFile(): boolean {
    return this.props.documentId !== undefined;
  }

  /** Correctif audit Codex P1-003 — les champs `documentVersionId`/`documentChecksum`/
   *  `documentFileName`/`documentMimeType` sont TOUJOURS dérivés d'un document déjà vérifié par
   *  l'appelant (`verifyAttachableDocument`), jamais des valeurs fournies directement par le
   *  client. */
  attachDocument(input: {
    documentId: string;
    documentVersionId: string;
    documentChecksum: string;
    documentFileName: string;
    documentMimeType: string;
    expiresAt?: Date | undefined;
    /** Sprint 8C.1 — posé uniquement quand cette révision est une Annexe TenderOS générée pour un
     *  formulaire officiel — jamais pour un fichier déposé manuellement par un acteur. */
    officialTemplateId?: string | undefined;
    formDataSnapshot?: Record<string, unknown> | undefined;
    /** Checkpoint TENDEROS-2.1-P2.2-F3 — CandidateCompany effectif du Tender à CET instant précis
     *  (mission §18/§26), capturé par l'appelant depuis `Tender.candidateCompanyId`, jamais résolu
     *  ici (aucune E/S dans l'entité). Toujours réévalué à CHAQUE attachement — y compris quand une
     *  révision DRAFT existante est réutilisée — jamais figé une seule fois à `create()`. */
    candidateCompanyId?: string | undefined;
    occurredAt: Date;
  }): void {
    if (this.props.status !== AdministrativeDocumentRevisionStatus.Draft) {
      throw new ImmutableAdministrativeDocumentRevisionError();
    }
    this.props.documentId = input.documentId;
    this.props.documentVersionId = input.documentVersionId;
    this.props.documentChecksum = input.documentChecksum;
    this.props.documentFileName = input.documentFileName;
    this.props.documentMimeType = input.documentMimeType;
    this.props.expiresAt = input.expiresAt;
    this.props.officialTemplateId = input.officialTemplateId;
    this.props.formDataSnapshot = input.formDataSnapshot;
    this.props.candidateCompanyId = input.candidateCompanyId;
    this.props.updatedAt = input.occurredAt;
  }

  submitForReview(occurredAt: Date): void {
    assertAdministrativeDocumentRevisionStatusTransition(this.props.status, AdministrativeDocumentRevisionStatus.InReview);
    this.props.status = AdministrativeDocumentRevisionStatus.InReview;
    this.props.updatedAt = occurredAt;
  }

  /** Idempotent : revalider une révision déjà VALIDATED est un no-op toléré (mission §21 —
   *  l'idempotence de la ré-application exacte n'est jamais un rejet, seule une AUTRE révision en
   *  conflit l'est — vérifié par l'appelant via `AdministrativeDocument.markValidated`). */
  validate(occurredAt: Date): void {
    if (this.props.status === AdministrativeDocumentRevisionStatus.Validated) {
      return;
    }
    assertAdministrativeDocumentRevisionStatusTransition(this.props.status, AdministrativeDocumentRevisionStatus.Validated);
    this.props.status = AdministrativeDocumentRevisionStatus.Validated;
    this.props.updatedAt = occurredAt;
  }

  reject(occurredAt: Date): void {
    assertAdministrativeDocumentRevisionStatusTransition(this.props.status, AdministrativeDocumentRevisionStatus.Rejected);
    this.props.status = AdministrativeDocumentRevisionStatus.Rejected;
    this.props.updatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    assertAdministrativeDocumentRevisionStatusTransition(this.props.status, AdministrativeDocumentRevisionStatus.Archived);
    this.props.status = AdministrativeDocumentRevisionStatus.Archived;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §21 — une nouvelle révision succède à une révision VALIDATED précédente, qui devient
   *  REPLACED (jamais supprimée, l'historique reste consultable). */
  markReplaced(occurredAt: Date): void {
    assertAdministrativeDocumentRevisionStatusTransition(this.props.status, AdministrativeDocumentRevisionStatus.Replaced);
    this.props.status = AdministrativeDocumentRevisionStatus.Replaced;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get administrativeDocumentId(): string {
    return this.props.administrativeDocumentId;
  }
  get revisionNumber(): number {
    return this.props.revisionNumber;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get documentChecksum(): string | undefined {
    return this.props.documentChecksum;
  }
  get documentFileName(): string | undefined {
    return this.props.documentFileName;
  }
  get documentMimeType(): string | undefined {
    return this.props.documentMimeType;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get officialTemplateId(): string | undefined {
    return this.props.officialTemplateId;
  }
  get formDataSnapshot(): Record<string, unknown> | undefined {
    return this.props.formDataSnapshot;
  }
  get candidateCompanyId(): string | undefined {
    return this.props.candidateCompanyId;
  }
  get status(): AdministrativeDocumentRevisionStatus {
    return this.props.status;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
