import type { AiModel } from "../../domain/ai-model.aggregate";

export type ListAiModelsFilter = Readonly<{
  enabledForBenchmark?: boolean | undefined;
  enabledForProduction?: boolean | undefined;
}>;

/** Registre global des modèles autorisés (Sprint 5.2 §"le modèle doit appartenir à une liste
 *  autorisée") — pas de `organizationId` : lecture partagée par toutes les organisations, mutation
 *  réservée à OWNER/ORGANIZATION_ADMIN via `assertHasAiBenchmarkPermission`. */
export interface AiModelRepository {
  findById(input: { id: string }): Promise<AiModel | null>;
  findByProviderAndModelKey(input: { provider: string; modelKey: string }): Promise<AiModel | null>;
  list(filter?: ListAiModelsFilter): Promise<readonly AiModel[]>;
  create(model: AiModel): Promise<void>;
  save(model: AiModel): Promise<void>;
}

export const AI_MODEL_REPOSITORY = Symbol("AI_MODEL_REPOSITORY");
