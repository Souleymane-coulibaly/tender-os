import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import {
  AiSuggestionAlreadyProcessedError,
  AiSuggestionInvalidProposedValueError,
  AiSuggestionNotFoundError,
  AiSuggestionPermissionDeniedError,
  AiSuggestionSchemaNotRegisteredError,
} from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "../services/ai-suggestion-field-schema-registry";

export type ModifyAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  editedValue: unknown;
  reason?: string | undefined;
}>;

/** Un humain édite la valeur proposée avant de l'accepter — `appliedValue` diffère alors de
 *  `proposedValue` (mission Sprint 1 §3 statuts "MODIFIED"), la proposition IA d'origine reste
 *  conservée intacte pour l'audit.
 *
 *  Correctif audit Codex P1-004 — `editedValue` est validé par le MÊME schéma central que la
 *  proposition d'origine (résolu par `AiSuggestionFieldSchemaRegistry` sur le couple
 *  entityType/fieldName de la suggestion) avant de devenir `appliedValue` — jamais une valeur
 *  humaine libre persistée sans validation. */
@Injectable()
export class ModifyAiSuggestionUseCase {
  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy,
    private readonly schemaRegistry: AiSuggestionFieldSchemaRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ModifyAiSuggestionCommand): Promise<AiSuggestionSummary> {
    if (!roleHasAiSuggestionPermission(command.actorRole, AiSuggestionPermission.Decide)) {
      throw new AiSuggestionPermissionDeniedError();
    }

    const existing = await this.repository.findById({ id: command.id, organizationId: command.organizationId });
    if (!existing) {
      throw new AiSuggestionNotFoundError();
    }

    // Correctif audit Codex P1-005.
    await this.targetAccessPolicy.assertCanAccessTarget({
      organizationId: command.organizationId,
      actorId: command.actorUserId,
      actorRole: command.actorRole,
      entityType: existing.entityType,
      entityId: existing.entityId,
    });

    const schema = this.schemaRegistry.resolve(existing.entityType, existing.fieldName);
    if (!schema) {
      throw new AiSuggestionSchemaNotRegisteredError(existing.entityType, existing.fieldName);
    }
    const parsedEditedValue = schema.safeParse(command.editedValue);
    if (!parsedEditedValue.success) {
      throw new AiSuggestionInvalidProposedValueError(parsedEditedValue.error.message);
    }

    const now = this.clock.now();
    const updated = await this.repository.transitionFromPending({
      id: command.id,
      organizationId: command.organizationId,
      newStatus: AiSuggestionStatus.Modified,
      validatedByUserId: command.actorUserId,
      validatedAt: now,
      decisionReason: command.reason,
      appliedValue: parsedEditedValue.data,
      updatedAt: now,
    });

    if (!updated) {
      throw new AiSuggestionAlreadyProcessedError();
    }

    return toAiSuggestionSummary(updated);
  }
}
