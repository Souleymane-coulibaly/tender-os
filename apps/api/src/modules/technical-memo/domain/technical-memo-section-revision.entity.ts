import type { TechnicalMemoSectionRevisionSource } from "./enums";
import type { TechnicalMemoSectionCitation } from "./technical-memo-section-citation.value-object";

export type TechnicalMemoSectionRevisionProps = {
  id: string;
  organizationId: string;
  technicalMemoSectionId: string;
  revisionNumber: number;
  source: TechnicalMemoSectionRevisionSource;
  content: string;
  userInstruction?: string | undefined;
  aiModel?: string | undefined;
  promptVersion?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  missingDataNotes: readonly string[];
  citations: readonly TechnicalMemoSectionCitation[];
  /** Checkpoint 2.1-P2.1-FIX-D — provenance figée au moment de la génération/édition, voir la
   *  documentation du modèle Prisma `TechnicalMemoSectionRevision`. */
  candidateCompanyId?: string | undefined;
  analysisVersion?: number | undefined;
  dceRevision?: number | undefined;
  createdBy: string;
  createdAt: Date;
};

/** Historique APPEND-ONLY (mission §39/§42) — jamais mutée après création, même motif que
 *  `GeneratedDocumentRevision` (Sprint 10). Les sources (`citations`) sont figées AU LANCEMENT
 *  (mission §85), jamais recalculées après coup même si une Knowledge Entry change de version. */
export class TechnicalMemoSectionRevision {
  private constructor(private readonly props: TechnicalMemoSectionRevisionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    technicalMemoSectionId: string;
    revisionNumber: number;
    source: TechnicalMemoSectionRevisionSource;
    content: string;
    userInstruction?: string | undefined;
    aiModel?: string | undefined;
    promptVersion?: number | undefined;
    inputTokenCount?: number | undefined;
    outputTokenCount?: number | undefined;
    totalTokenCount?: number | undefined;
    missingDataNotes?: readonly string[] | undefined;
    citations?: readonly TechnicalMemoSectionCitation[] | undefined;
    candidateCompanyId?: string | undefined;
    analysisVersion?: number | undefined;
    dceRevision?: number | undefined;
    createdBy: string;
    occurredAt: Date;
  }): TechnicalMemoSectionRevision {
    return new TechnicalMemoSectionRevision({
      id: input.id,
      organizationId: input.organizationId,
      technicalMemoSectionId: input.technicalMemoSectionId,
      revisionNumber: input.revisionNumber,
      source: input.source,
      content: input.content,
      userInstruction: input.userInstruction,
      aiModel: input.aiModel,
      promptVersion: input.promptVersion,
      inputTokenCount: input.inputTokenCount,
      outputTokenCount: input.outputTokenCount,
      totalTokenCount: input.totalTokenCount,
      missingDataNotes: input.missingDataNotes ?? [],
      citations: input.citations ?? [],
      candidateCompanyId: input.candidateCompanyId,
      analysisVersion: input.analysisVersion,
      dceRevision: input.dceRevision,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: TechnicalMemoSectionRevisionProps): TechnicalMemoSectionRevision {
    return new TechnicalMemoSectionRevision(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get technicalMemoSectionId(): string {
    return this.props.technicalMemoSectionId;
  }
  get revisionNumber(): number {
    return this.props.revisionNumber;
  }
  get source(): TechnicalMemoSectionRevisionSource {
    return this.props.source;
  }
  get content(): string {
    return this.props.content;
  }
  get userInstruction(): string | undefined {
    return this.props.userInstruction;
  }
  get aiModel(): string | undefined {
    return this.props.aiModel;
  }
  get promptVersion(): number | undefined {
    return this.props.promptVersion;
  }
  get inputTokenCount(): number | undefined {
    return this.props.inputTokenCount;
  }
  get outputTokenCount(): number | undefined {
    return this.props.outputTokenCount;
  }
  get totalTokenCount(): number | undefined {
    return this.props.totalTokenCount;
  }
  get missingDataNotes(): readonly string[] {
    return this.props.missingDataNotes;
  }
  get citations(): readonly TechnicalMemoSectionCitation[] {
    return this.props.citations;
  }
  get candidateCompanyId(): string | undefined {
    return this.props.candidateCompanyId;
  }
  get analysisVersion(): number | undefined {
    return this.props.analysisVersion;
  }
  get dceRevision(): number | undefined {
    return this.props.dceRevision;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
