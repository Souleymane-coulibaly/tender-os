import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AI_SUGGESTION_ENTITY_TYPES } from "../../domain/ai-suggestion-entity-type";
import { AiSuggestionInvalidProposedValueError, AiSuggestionSchemaNotRegisteredError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "../services/ai-suggestion-field-schema-registry";

export type CreateAiSuggestionCommand = Readonly<{
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersionId?: string | undefined;
  sourcePage?: number | undefined;
  sourceChunkReference?: string | undefined;
  sourceAnalysisAttemptId?: string | undefined;
  aiProvider?: string | undefined;
  aiModel?: string | undefined;
  createdByProcess: string;
}>;

/**
 * Point d'entrée IN-PROCESS pour tout futur module producteur de suggestions IA (Sprints 4, 6,
 * 11, 12, 13) — jamais exposé en HTTP public (aucun mapper métier n'existe encore ce sprint).
 *
 * Correctif audit Codex P1-003 — le schéma de validation n'est plus fourni par l'appelant : il
 * est résolu depuis `AiSuggestionFieldSchemaRegistry` par (entityType, fieldName). Un producteur
 * qui n'a pas enregistré son schéma au préalable (dans son propre `onModuleInit`) se voit refuser
 * la création — c'est le comportement attendu en Sprint 1, où aucun schéma n'est encore enregistré
 * (aucun mapper métier créé, conformément à la mission).
 */
@Injectable()
export class CreateAiSuggestionUseCase {
  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    private readonly schemaRegistry: AiSuggestionFieldSchemaRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateAiSuggestionCommand): Promise<AiSuggestionSummary> {
    if (!AI_SUGGESTION_ENTITY_TYPES.includes(command.entityType)) {
      throw new AiSuggestionInvalidProposedValueError(`entityType "${command.entityType}" hors catalogue fermé.`);
    }
    if (command.confidence < 0 || command.confidence > 1) {
      throw new AiSuggestionInvalidProposedValueError("confidence doit être compris entre 0 et 1.");
    }

    const schema = this.schemaRegistry.resolve(command.entityType, command.fieldName);
    if (!schema) {
      throw new AiSuggestionSchemaNotRegisteredError(command.entityType, command.fieldName);
    }

    const parsed = schema.safeParse(command.proposedValue);
    if (!parsed.success) {
      throw new AiSuggestionInvalidProposedValueError(parsed.error.message);
    }

    const now = this.clock.now();
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      entityType: command.entityType,
      entityId: command.entityId,
      fieldName: command.fieldName,
      proposedValue: parsed.data,
      confidence: command.confidence,
      sourceDocumentId: command.sourceDocumentId,
      sourceDocumentVersionId: command.sourceDocumentVersionId,
      sourcePage: command.sourcePage,
      sourceChunkReference: command.sourceChunkReference,
      sourceAnalysisAttemptId: command.sourceAnalysisAttemptId,
      aiProvider: command.aiProvider,
      aiModel: command.aiModel,
      createdByProcess: command.createdByProcess,
      createdAt: now,
    });

    return toAiSuggestionSummary(created);
  }
}
