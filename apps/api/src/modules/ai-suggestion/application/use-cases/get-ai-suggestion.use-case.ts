import { Inject, Injectable, Optional } from "@nestjs/common";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { DEFAULT_TARGET_ACCESS_POLICY } from "../../domain/default-target-access-policy";
import { AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

@Injectable()
export class GetAiSuggestionUseCase {
  private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy;

  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    // V2 Sprint 4 — @Optional() : ce module générique ne fournit plus lui-même de valeur par
    // défaut pour ce token (voir ai-suggestion.module.ts), afin qu'un module producteur
    // (ai-suggestion-bridge) puisse rebinder AI_SUGGESTION_TARGET_ACCESS_POLICY globalement sans
    // jamais toucher à ce module. Repli sur le défaut (Domain) si aucun bridge n'est importé.
    @Optional() @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) targetAccessPolicy?: AiSuggestionTargetAccessPolicy,
  ) {
    this.targetAccessPolicy = targetAccessPolicy ?? DEFAULT_TARGET_ACCESS_POLICY;
  }

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
      entityId: record.entityId ?? undefined,
      parentTenderId: record.parentTenderId,
      parentLotId: record.parentLotId ?? undefined,
    });

    return toAiSuggestionSummary(record);
  }
}
