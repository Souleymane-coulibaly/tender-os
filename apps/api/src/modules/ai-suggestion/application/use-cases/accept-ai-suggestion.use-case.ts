import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionAlreadyProcessedError, AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

export type AcceptAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
}>;

/** Mission Sprint 1 §3 — "l'acceptation doit passer par un use case explicite". La valeur
 *  retenue (`appliedValue`) est exactement la valeur proposée, sans édition humaine (voir
 *  `ModifyAiSuggestionUseCase` pour le cas d'une valeur éditée avant acceptation). */
@Injectable()
export class AcceptAiSuggestionUseCase {
  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: AcceptAiSuggestionCommand): Promise<AiSuggestionSummary> {
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

    const now = this.clock.now();
    const updated = await this.repository.transitionFromPending({
      id: command.id,
      organizationId: command.organizationId,
      newStatus: AiSuggestionStatus.Accepted,
      validatedByUserId: command.actorUserId,
      validatedAt: now,
      appliedValue: existing.proposedValue,
      updatedAt: now,
    });

    if (!updated) {
      throw new AiSuggestionAlreadyProcessedError();
    }

    return toAiSuggestionSummary(updated);
  }
}
