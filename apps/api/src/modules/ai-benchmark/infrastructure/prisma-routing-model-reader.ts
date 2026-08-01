import { Inject, Injectable } from "@nestjs/common";
import type { RoutedModel, RoutingModelReader } from "../../pricing/application/ports/routing-model-reader";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../application/ports/ai-model.repository";
import { ROUTING_POLICY_REPOSITORY, type RoutingPolicyRepository } from "../application/ports/routing-policy.repository";

/**
 * Implémentation du port `RoutingModelReader` DÉFINI PAR `pricing` (Sprint 7) — résout le modèle
 * PRINCIPAL qu'une `RoutingPolicy` ACTIVE router­ait pour un `taskType`, utilisé UNIQUEMENT pour une
 * prévision (mission §"Prévision avant génération"), jamais pour router un appel provider réel
 * (`ai-benchmark` ne connaît aucun appel provider). Retourne `null` si aucune policy active, ou si
 * le modèle référencé a depuis été désactivé — même discipline que `PrismaRoutingPolicyResolver`.
 */
@Injectable()
export class PrismaRoutingModelReader implements RoutingModelReader {
  constructor(
    @Inject(ROUTING_POLICY_REPOSITORY) private readonly routingPolicyRepository: RoutingPolicyRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
  ) {}

  async resolveActiveModel(input: { organizationId: string; taskType: string }): Promise<RoutedModel | null> {
    const policy = await this.routingPolicyRepository.findActive({ organizationId: input.organizationId, promptKey: input.taskType });
    if (!policy) return null;

    const model = await this.aiModelRepository.findById({ id: policy.primaryAiModelId });
    if (!model || !model.enabledForProduction) return null;

    return { aiModelId: model.id, provider: model.provider, modelKey: model.modelKey, policyId: policy.id, policyVersion: policy.version };
  }
}
