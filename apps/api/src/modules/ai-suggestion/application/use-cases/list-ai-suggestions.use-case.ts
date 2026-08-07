import { Inject, Injectable, Optional } from "@nestjs/common";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { DEFAULT_TARGET_ACCESS_POLICY } from "../../domain/default-target-access-policy";
import { AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository, type AiSuggestionRecord } from "../ports/ai-suggestion.repository";

export type ListAiSuggestionsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  entityType?: string | undefined;
  entityId?: string | undefined;
  parentTenderId?: string | undefined;
  status?: string | undefined;
}>;

@Injectable()
export class ListAiSuggestionsUseCase {
  private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy;

  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Optional() @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) targetAccessPolicy?: AiSuggestionTargetAccessPolicy,
  ) {
    this.targetAccessPolicy = targetAccessPolicy ?? DEFAULT_TARGET_ACCESS_POLICY;
  }

  async execute(query: ListAiSuggestionsQuery): Promise<AiSuggestionSummary[]> {
    if (!roleHasAiSuggestionPermission(query.actorRole, AiSuggestionPermission.Read)) {
      throw new AiSuggestionPermissionDeniedError();
    }

    const records = await this.repository.list({
      organizationId: query.organizationId,
      entityType: query.entityType,
      entityId: query.entityId,
      parentTenderId: query.parentTenderId,
      status: query.status,
    });

    // Correctif audit Codex P1-005 — une suggestion dont l'entité cible n'est pas accessible à
    // l'acteur est silencieusement exclue de la liste (jamais une exception qui casserait la
    // liste entière pour un seul élément inaccessible).
    const accessible = await this.filterAccessible(records, query);

    return accessible.map(toAiSuggestionSummary);
  }

  private async filterAccessible(records: AiSuggestionRecord[], query: ListAiSuggestionsQuery): Promise<AiSuggestionRecord[]> {
    const checks = await Promise.all(
      records.map(async (record) => {
        try {
          await this.targetAccessPolicy.assertCanAccessTarget({
            organizationId: query.organizationId,
            actorId: query.actorId,
            actorRole: query.actorRole,
            entityType: record.entityType,
            entityId: record.entityId ?? undefined,
            parentTenderId: record.parentTenderId,
            parentLotId: record.parentLotId ?? undefined,
          });
          return true;
        } catch {
          return false;
        }
      }),
    );

    return records.filter((_, index) => checks[index]);
  }
}
