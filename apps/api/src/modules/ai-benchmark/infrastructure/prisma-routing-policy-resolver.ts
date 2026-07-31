import { Inject, Injectable } from "@nestjs/common";
import type { ActiveRoutingDecision, RoutingPolicyResolver } from "../../analysis/application/ports/routing-policy-resolver";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../application/ports/ai-model.repository";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../application/ports/routing-policy.repository";

/**
 * Implémentation du port `RoutingPolicyResolver` DÉFINI PAR `analysis` (Sprint 5.2 §"Intégration
 * Analysis") — traduit la `RoutingPolicy` ACTIVE (si elle existe) en sélecteurs {provider,
 * modelKey} concrets pour `AIProviderRegistry`, en résolvant les `AiModel` référencés. Retourne
 * `null` (jamais une exception) si aucune policy active, ou si un modèle référencé a depuis été
 * désactivé/supprimé — un routage cassé ne doit jamais faire échouer une analyse, seulement
 * retomber sur le comportement legacy (`ProcessAnalysisJobUseCase`).
 */
@Injectable()
export class PrismaRoutingPolicyResolver implements RoutingPolicyResolver {
  constructor(
    @Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
  ) {}

  async resolveActive(input: { organizationId: string; promptKey: string }): Promise<ActiveRoutingDecision | null> {
    const policy = await this.routingPolicyRepository.findActive({
      organizationId: input.organizationId,
      promptKey: input.promptKey as never,
    });
    if (!policy) {
      return null;
    }

    const primaryModel = await this.aiModelRepository.findById({ id: policy.primaryAiModelId });
    if (!primaryModel || !primaryModel.enabledForProduction) {
      // Modèle principal désactivé/supprimé depuis l'activation de la policy — jamais un routage
      // vers un modèle non autorisé en production ; repli sur le comportement legacy.
      return null;
    }

    let escalationModel: { provider: string; modelKey: string } | undefined;
    if (policy.escalationAiModelId) {
      const model = await this.aiModelRepository.findById({ id: policy.escalationAiModelId });
      if (model && model.enabledForProduction) {
        escalationModel = { provider: model.provider, modelKey: model.modelKey };
      }
    }

    return {
      policyId: policy.id,
      policyVersion: policy.version,
      primaryModel: { provider: primaryModel.provider, modelKey: primaryModel.modelKey },
      escalationModel,
      confidenceThreshold: policy.confidenceThreshold,
      provenanceRequired: policy.provenanceRequired,
      escalationConditions: policy.escalationConditions,
      timeoutMs: policy.timeoutMs,
      maxRetries: policy.maxRetries,
    };
  }
}
