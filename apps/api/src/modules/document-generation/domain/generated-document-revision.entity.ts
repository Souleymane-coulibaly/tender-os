import type { FieldProvenanceEntry } from "./field-provenance";
import { GeneratedDocumentRevisionStatus } from "./generated-document-revision-status";
import { ReviewStatus } from "./review-status";

export type GeneratedDocumentRevisionProps = {
  id: string;
  organizationId: string;
  generatedDocumentId: string;
  revisionNumber: number;
  previousRevisionId?: string | undefined;
  documentTemplateVersionId: string;
  status: GeneratedDocumentRevisionStatus;
  dataSnapshot: Readonly<Record<string, unknown>>;
  provenance: readonly FieldProvenanceEntry[];
  missingFields: readonly string[];
  reviewStatus: ReviewStatus;
  artifactDocumentId?: string | undefined;
  artifactDocumentVersionId?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date | undefined;
};

/**
 * Une ligne par tentative de génération, JAMAIS mutée après création (même motif qu'`ExportJob` —
 * le rendu s'exécute de façon synchrone dans le use case, la ligne est donc créée déjà dans son
 * état final COMPLETED/FAILED, jamais un PENDING transitoire persisté puis mis à jour). `dataSnapshot`
 * et `documentTemplateVersionId` sont figés pour toujours à cet instant (mission "un futur edit
 * d'une entité source ne doit jamais altérer un document déjà généré" / "templateVersionId
 * explicitement fixé au lancement, jamais template.currentVersion résolu implicitement").
 */
export class GeneratedDocumentRevision {
  private constructor(private readonly props: GeneratedDocumentRevisionProps) {}

  static completed(input: {
    id: string;
    organizationId: string;
    generatedDocumentId: string;
    revisionNumber: number;
    previousRevisionId?: string | undefined;
    documentTemplateVersionId: string;
    dataSnapshot: Readonly<Record<string, unknown>>;
    provenance: readonly FieldProvenanceEntry[];
    missingFields: readonly string[];
    artifactDocumentId: string;
    artifactDocumentVersionId: string;
    createdBy: string;
    occurredAt: Date;
  }): GeneratedDocumentRevision {
    return new GeneratedDocumentRevision({
      id: input.id,
      organizationId: input.organizationId,
      generatedDocumentId: input.generatedDocumentId,
      revisionNumber: input.revisionNumber,
      previousRevisionId: input.previousRevisionId,
      documentTemplateVersionId: input.documentTemplateVersionId,
      status: GeneratedDocumentRevisionStatus.Completed,
      dataSnapshot: input.dataSnapshot,
      provenance: input.provenance,
      missingFields: input.missingFields,
      reviewStatus: ReviewStatus.Generated,
      artifactDocumentId: input.artifactDocumentId,
      artifactDocumentVersionId: input.artifactDocumentVersionId,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      completedAt: input.occurredAt,
    });
  }

  static failed(input: {
    id: string;
    organizationId: string;
    generatedDocumentId: string;
    revisionNumber: number;
    previousRevisionId?: string | undefined;
    documentTemplateVersionId: string;
    dataSnapshot: Readonly<Record<string, unknown>>;
    provenance: readonly FieldProvenanceEntry[];
    missingFields: readonly string[];
    errorCode: string;
    errorMessage: string;
    createdBy: string;
    occurredAt: Date;
  }): GeneratedDocumentRevision {
    return new GeneratedDocumentRevision({
      id: input.id,
      organizationId: input.organizationId,
      generatedDocumentId: input.generatedDocumentId,
      revisionNumber: input.revisionNumber,
      previousRevisionId: input.previousRevisionId,
      documentTemplateVersionId: input.documentTemplateVersionId,
      status: GeneratedDocumentRevisionStatus.Failed,
      dataSnapshot: input.dataSnapshot,
      provenance: input.provenance,
      missingFields: input.missingFields,
      reviewStatus: ReviewStatus.Generated,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      completedAt: input.occurredAt,
    });
  }

  static rehydrate(props: GeneratedDocumentRevisionProps): GeneratedDocumentRevision {
    return new GeneratedDocumentRevision(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get generatedDocumentId(): string {
    return this.props.generatedDocumentId;
  }
  get revisionNumber(): number {
    return this.props.revisionNumber;
  }
  get previousRevisionId(): string | undefined {
    return this.props.previousRevisionId;
  }
  get documentTemplateVersionId(): string {
    return this.props.documentTemplateVersionId;
  }
  get status(): GeneratedDocumentRevisionStatus {
    return this.props.status;
  }
  get dataSnapshot(): Readonly<Record<string, unknown>> {
    return this.props.dataSnapshot;
  }
  get provenance(): readonly FieldProvenanceEntry[] {
    return this.props.provenance;
  }
  get missingFields(): readonly string[] {
    return this.props.missingFields;
  }
  get reviewStatus(): ReviewStatus {
    return this.props.reviewStatus;
  }
  get artifactDocumentId(): string | undefined {
    return this.props.artifactDocumentId;
  }
  get artifactDocumentVersionId(): string | undefined {
    return this.props.artifactDocumentVersionId;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
}
