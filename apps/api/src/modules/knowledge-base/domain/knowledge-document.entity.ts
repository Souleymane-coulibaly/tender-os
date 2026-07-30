import { KnowledgeDocumentNotReprocessableError } from "./errors";
import { isKnowledgeDocumentReprocessable, KnowledgeDocumentStatus } from "./knowledge-document-status";

export type KnowledgeDocumentProps = {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  /** Identifiant du `Document` (module Documents, domain=KNOWLEDGE) réellement stocké — jamais un
   *  second stockage : mission §6 "Ne pas dupliquer... stockage fichier". */
  documentId: string;
  /** Version de l'entrée à laquelle CE document appartient (mission §10) — un document remplacé
   *  crée une nouvelle ligne `KnowledgeDocument` rattachée à la nouvelle version, jamais une
   *  mise à jour en place de l'ancienne. */
  versionNumber: number;
  status: KnowledgeDocumentStatus;
  language?: string | undefined;
  warnings: readonly string[];
  errorMessage?: string | undefined;
  /** Jeton de réservation (même motif que `DocumentExtraction.attemptCount`, module Extraction) —
   *  incrémenté uniquement par `reserve()`, comparé lors de la finalisation. */
  attemptCount: number;
  processedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Document lié à une entrée de connaissance (mission Sprint 5 §6/§7) — porte SON PROPRE cycle de
 * traitement (mission §"Ne pas dupliquer... statuts de traitement"), séparé du module Extraction :
 * ce document n'est jamais rattaché à un DCE/Tender, voir `ExtractDocumentContentUseCase`
 * (contrat public Extraction, Sprint 5). Même motif en 3 phases que `DocumentExtraction`
 * (réservation courte / traitement hors transaction / finalisation courte).
 */
export class KnowledgeDocument {
  private constructor(private props: KnowledgeDocumentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    knowledgeEntryId: string;
    documentId: string;
    versionNumber: number;
    occurredAt: Date;
  }): KnowledgeDocument {
    return new KnowledgeDocument({
      id: input.id,
      organizationId: input.organizationId,
      knowledgeEntryId: input.knowledgeEntryId,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      status: KnowledgeDocumentStatus.Pending,
      warnings: [],
      attemptCount: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: KnowledgeDocumentProps): KnowledgeDocument {
    return new KnowledgeDocument(props);
  }

  reserve(occurredAt: Date): void {
    if (!(this.props.status === KnowledgeDocumentStatus.Pending || isKnowledgeDocumentReprocessable(this.props.status))) {
      throw new KnowledgeDocumentNotReprocessableError({ status: this.props.status });
    }
    this.props.status = KnowledgeDocumentStatus.Processing;
    this.props.attemptCount += 1;
    this.props.updatedAt = occurredAt;
  }

  complete(
    input: {
      outcome: typeof KnowledgeDocumentStatus.Ready | typeof KnowledgeDocumentStatus.PartiallyReady;
      language?: string | undefined;
      warnings: readonly string[];
    },
    occurredAt: Date,
  ): void {
    this.props.status = input.outcome;
    this.props.language = input.language;
    this.props.warnings = input.warnings;
    this.props.errorMessage = undefined;
    this.props.processedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  fail(input: { errorMessage: string }, occurredAt: Date): void {
    this.props.status = KnowledgeDocumentStatus.Failed;
    this.props.errorMessage = input.errorMessage;
    this.props.processedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  assertReprocessable(): void {
    if (!isKnowledgeDocumentReprocessable(this.props.status)) {
      throw new KnowledgeDocumentNotReprocessableError({ status: this.props.status });
    }
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get knowledgeEntryId(): string {
    return this.props.knowledgeEntryId;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get status(): KnowledgeDocumentStatus {
    return this.props.status;
  }
  get language(): string | undefined {
    return this.props.language;
  }
  get warnings(): readonly string[] {
    return this.props.warnings;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get attemptCount(): number {
    return this.props.attemptCount;
  }
  get processedAt(): Date | undefined {
    return this.props.processedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
