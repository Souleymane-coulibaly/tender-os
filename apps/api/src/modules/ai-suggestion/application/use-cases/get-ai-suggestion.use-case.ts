import { Inject, Injectable } from "@nestjs/common";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

@Injectable()
export class GetAiSuggestionUseCase {
  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy,
  ) {}

  async execute(input: { id: string; organizationId: string; actorId: string; actorRole: string }): Promise<AiSuggestionSummary> {
    if (!roleHasAiSuggestionPermission(input.actorRole, AiSuggestionPermission.Read)) {
      throw new AiSuggestionPermissionDeniedError();
    }

    const record = await this.repository.findById({ id: input.id, organizationId: input.organizationId });
    if (!record) {
      throw new AiSuggestionNotFoundError();
    }

    // Correctif audit Codex P1-005 — vérification d'accès à l'entité cible, distincte de la
    // permission organisation+rôle déjà vérifiée ci-dessus.
    await this.targetAccessPolicy.assertCanAccessTarget({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityType: record.entityType,
      entityId: record.entityId,
    });

    return toAiSuggestionSummary(record);
  }
}
