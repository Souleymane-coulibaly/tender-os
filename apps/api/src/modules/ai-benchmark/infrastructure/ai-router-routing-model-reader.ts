import { Inject, Injectable } from "@nestjs/common";
import { AI_TASK_TYPES, type AiTaskType } from "../../../shared-kernel/ai-task-type";
import { AiModelRouter } from "../../ai-routing/application/services/ai-model-router";
import type { RoutedModel, RoutingModelReader } from "../../pricing/application/ports/routing-model-reader";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../application/ports/ai-model.repository";

const ROUTABLE_TASK_TYPES: ReadonlySet<string> = new Set(AI_TASK_TYPES);

function isAiTaskType(value: string): value is AiTaskType {
  return ROUTABLE_TASK_TYPES.has(value);
}

/**
 * Implémentation du port `RoutingModelReader` de `pricing`. Le modèle d'une prévision de coût est
 * celui qu'`AiModelRouter` choisit au moment de l'appel réel (préférence de l'utilisateur, sinon
 * matrice par défaut) — plus jamais une RoutingPolicy, retirée du chemin runtime des 4 pipelines.
 * Le tarif vient du registre (Configuration IA → Modèles), retrouvé par fournisseur + identifiant :
 * même recherche que le coût réel d'une génération (`PrismaGenerationRoutingDecisionWriter`).
 */
@Injectable()
export class AiRouterRoutingModelReader implements RoutingModelReader {
  constructor(
    private readonly aiModelRouter: AiModelRouter,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
  ) {}

  async resolveModel(input: { organizationId: string; taskType: string; userId?: string | undefined }): Promise<RoutedModel | null> {
    if (!isAiTaskType(input.taskType)) return null;

    const routed = await this.aiModelRouter.resolve({ taskType: input.taskType, organizationId: input.organizationId, userId: input.userId });
    const registered = await this.aiModelRepository.findByProviderAndModelKey({ provider: routed.provider, modelKey: routed.modelKey });

    return { provider: routed.provider, modelKey: routed.modelKey, aiModelId: registered?.id };
  }
}
