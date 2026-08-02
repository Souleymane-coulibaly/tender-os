import type { RenderableBlock } from "../../export";
import { blocksToPlainText, computeCharacterCount, validateDeliverableContentBlocks } from "./deliverable-content-blocks";
import { DeliverableRevisionSourceType } from "./deliverable-revision-source-type";
import { assertDeliverableRevisionStatusTransition, DeliverableRevisionStatus, isEditableDeliverableRevisionStatus } from "./deliverable-revision-status";
import { ImmutableRevisionError, RevisionEditConflictError } from "./errors";

export type DeliverableRevisionProps = {
  id: string;
  organizationId: string;
  deliverableSectionId: string;
  revisionNumber: number;
  previousRevisionId?: string | undefined;
  sourceType: DeliverableRevisionSourceType;
  sourceGenerationId?: string | undefined;
  sourceGenerationVersionNumber?: number | undefined;
  /** Correctif audit Codex P2-001 — snapshot d'audit minimal, IMMUABLE, capturé UNIQUEMENT à la
   *  création d'une révision AI_GENERATED (jamais mis à jour ensuite) : la révision reste
   *  auditable même si la ligne `Generation` source évolue ou si le modèle Generation change de
   *  forme. `contextFingerprint` est un hash SHA-256 du contenu généré réellement figé sur cette
   *  révision — aucun contexte brut n'est dupliqué (mission — "ne duplique pas le contexte complet
   *  si cela expose inutilement des données"). */
  aiTaskType?: string | undefined;
  aiPromptVersionId?: string | undefined;
  aiModelProvider?: string | undefined;
  aiModelName?: string | undefined;
  aiRoutingDecisionId?: string | undefined;
  aiContextFingerprint?: string | undefined;
  aiGeneratedAt?: Date | undefined;
  contentStructured: readonly RenderableBlock[];
  contentText: string;
  characterCount: number;
  status: DeliverableRevisionStatus;
  editVersion: number;
  createdBy: string;
  createdByRole: string;
  createdAt: Date;
  updatedAt: Date;
  changeNote?: string | undefined;
};

/**
 * Mission Sprint 8A.1 §9/§10/§11 — cœur du versionnement du Mémoire technique. Une révision EST une
 * version (mission "chaque modification validée crée une nouvelle révision") : "une ancienne
 * révision ne doit jamais être écrasée" est garanti ici par `assertEditable()`/`applyEdit()`
 * refusant toute mutation dès que `status !== DRAFT`, et par le verrou optimiste `editVersion`
 * (mission §18 "conflit explicite, aucune donnée perdue").
 */
export class DeliverableRevision {
  private constructor(private props: DeliverableRevisionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableSectionId: string;
    revisionNumber: number;
    previousRevisionId?: string | undefined;
    sourceType: DeliverableRevisionSourceType;
    sourceGenerationId?: string | undefined;
    sourceGenerationVersionNumber?: number | undefined;
    aiTaskType?: string | undefined;
    aiPromptVersionId?: string | undefined;
    aiModelProvider?: string | undefined;
    aiModelName?: string | undefined;
    aiRoutingDecisionId?: string | undefined;
    aiContextFingerprint?: string | undefined;
    aiGeneratedAt?: Date | undefined;
    content: unknown;
    createdBy: string;
    createdByRole: string;
    occurredAt: Date;
    changeNote?: string | undefined;
  }): DeliverableRevision {
    if (input.sourceType === DeliverableRevisionSourceType.AiGenerated && !input.sourceGenerationId) {
      throw new Error("an AI_GENERATED revision requires sourceGenerationId");
    }
    if (input.sourceType === DeliverableRevisionSourceType.Restored && !input.previousRevisionId) {
      throw new Error("a RESTORED revision requires previousRevisionId");
    }
    const contentStructured = validateDeliverableContentBlocks(input.content);
    const contentText = blocksToPlainText(contentStructured);
    return new DeliverableRevision({
      id: input.id,
      organizationId: input.organizationId,
      deliverableSectionId: input.deliverableSectionId,
      revisionNumber: input.revisionNumber,
      previousRevisionId: input.previousRevisionId,
      sourceType: input.sourceType,
      sourceGenerationId: input.sourceGenerationId,
      sourceGenerationVersionNumber: input.sourceGenerationVersionNumber,
      aiTaskType: input.aiTaskType,
      aiPromptVersionId: input.aiPromptVersionId,
      aiModelProvider: input.aiModelProvider,
      aiModelName: input.aiModelName,
      aiRoutingDecisionId: input.aiRoutingDecisionId,
      aiContextFingerprint: input.aiContextFingerprint,
      aiGeneratedAt: input.aiGeneratedAt,
      contentStructured,
      contentText,
      characterCount: computeCharacterCount(contentStructured),
      status: DeliverableRevisionStatus.Draft,
      editVersion: 0,
      createdBy: input.createdBy,
      createdByRole: input.createdByRole,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      changeNote: input.changeNote,
    });
  }

  static rehydrate(props: DeliverableRevisionProps): DeliverableRevision {
    return new DeliverableRevision(props);
  }

  /** Mission §9/§18 — sauvegarde d'un brouillon : refuse toute écriture sur une révision non-DRAFT
   *  (immuabilité) et toute écriture basée sur un `editVersion` obsolète (concurrence). */
  applyEdit(input: { content: unknown; expectedEditVersion: number; changeNote?: string | undefined; occurredAt: Date }): void {
    if (!isEditableDeliverableRevisionStatus(this.props.status)) {
      throw new ImmutableRevisionError();
    }
    if (input.expectedEditVersion !== this.props.editVersion) {
      throw new RevisionEditConflictError();
    }
    const contentStructured = validateDeliverableContentBlocks(input.content);
    this.props.contentStructured = contentStructured;
    this.props.contentText = blocksToPlainText(contentStructured);
    this.props.characterCount = computeCharacterCount(contentStructured);
    this.props.editVersion += 1;
    this.props.updatedAt = input.occurredAt;
    if (input.changeNote !== undefined) {
      this.props.changeNote = input.changeNote;
    }
  }

  submitForReview(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.ReadyForReview);
    this.props.status = DeliverableRevisionStatus.ReadyForReview;
    this.props.updatedAt = occurredAt;
  }

  withdrawFromReview(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.Draft);
    this.props.status = DeliverableRevisionStatus.Draft;
    this.props.updatedAt = occurredAt;
  }

  validate(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.Validated);
    this.props.status = DeliverableRevisionStatus.Validated;
    this.props.updatedAt = occurredAt;
  }

  requestChanges(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.ChangesRequested);
    this.props.status = DeliverableRevisionStatus.ChangesRequested;
    this.props.updatedAt = occurredAt;
  }

  reject(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.Rejected);
    this.props.status = DeliverableRevisionStatus.Rejected;
    this.props.updatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    assertDeliverableRevisionStatusTransition(this.props.status, DeliverableRevisionStatus.Archived);
    this.props.status = DeliverableRevisionStatus.Archived;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §11 — seule une révision VALIDATED peut être sélectionnée pour export (vérifié à
   *  nouveau par le use case appelant ; exposé ici pour que le domaine reste la source de vérité). */
  get isValidated(): boolean {
    return this.props.status === DeliverableRevisionStatus.Validated;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableSectionId(): string {
    return this.props.deliverableSectionId;
  }
  get revisionNumber(): number {
    return this.props.revisionNumber;
  }
  get previousRevisionId(): string | undefined {
    return this.props.previousRevisionId;
  }
  get sourceType(): DeliverableRevisionSourceType {
    return this.props.sourceType;
  }
  get sourceGenerationId(): string | undefined {
    return this.props.sourceGenerationId;
  }
  get sourceGenerationVersionNumber(): number | undefined {
    return this.props.sourceGenerationVersionNumber;
  }
  get aiTaskType(): string | undefined {
    return this.props.aiTaskType;
  }
  get aiPromptVersionId(): string | undefined {
    return this.props.aiPromptVersionId;
  }
  get aiModelProvider(): string | undefined {
    return this.props.aiModelProvider;
  }
  get aiModelName(): string | undefined {
    return this.props.aiModelName;
  }
  get aiRoutingDecisionId(): string | undefined {
    return this.props.aiRoutingDecisionId;
  }
  get aiContextFingerprint(): string | undefined {
    return this.props.aiContextFingerprint;
  }
  get aiGeneratedAt(): Date | undefined {
    return this.props.aiGeneratedAt;
  }
  get contentStructured(): readonly RenderableBlock[] {
    return this.props.contentStructured;
  }
  get contentText(): string {
    return this.props.contentText;
  }
  get characterCount(): number {
    return this.props.characterCount;
  }
  get status(): DeliverableRevisionStatus {
    return this.props.status;
  }
  get editVersion(): number {
    return this.props.editVersion;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdByRole(): string {
    return this.props.createdByRole;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get changeNote(): string | undefined {
    return this.props.changeNote;
  }
}
