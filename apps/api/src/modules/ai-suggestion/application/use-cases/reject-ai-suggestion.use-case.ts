import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import { AiSuggestionAlreadyProcessedError, AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

export type RejectAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  reason?: string | undefined;
}>;

/** Mission Sprint 1 §3 — "conserver les suggestions rejetées pour l'audit" : la ligne n'est
 *  jamais supprimée, seul son statut transite vers REJECTED. */
@Injectable()
export class RejectAiSuggestionUseCase {
  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectAiSuggestionCommand): Promise<AiSuggestionSummary> {
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
      newStatus: AiSuggestionStatus.Rejected,
      validatedByUserId: command.actorUserId,
      rejectedAt: now,
      decisionReason: command.reason,
      updatedAt: now,
    });

    if (!updated) {
      throw new AiSuggestionAlreadyProcessedError();
    }

    return toAiSuggestionSummary(updated);
  }
}
