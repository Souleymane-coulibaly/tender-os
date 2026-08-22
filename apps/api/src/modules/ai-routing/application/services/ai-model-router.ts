import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { AiTaskType } from "../../../../shared-kernel/ai-task-type";
import { AI_ROUTING_MODEL_CATALOG, type AiRoutingModel } from "../../domain/ai-routing-model";
import { DEFAULT_ROUTING_MATRIX, isOverrideCompatible } from "../../domain/default-routing-matrix";
import { AI_MODEL_PREFERENCE_REPOSITORY, type AiModelPreferenceRepository } from "../ports/ai-model-preference.repository";

export type AiModelRoutingResolution = "DEFAULT" | "USER_OVERRIDE";

export type AiModelRoutingResult = Readonly<{
  provider: "OPENAI";
  model: AiRoutingModel;
  /** Chaîne littérale envoyée au provider (ex. "gpt-5.4-mini") — jamais recalculée par
   *  l'appelant : `AI_ROUTING_MODEL_CATALOG` reste la seule source de cette correspondance. */
  modelKey: string;
  resolution: AiModelRoutingResolution;
}>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4 — routeur central (mission §19). Signature volontairement fidèle
 * au concept du mission (`taskType`/`userId`/`organizationId` → `{provider, model, resolution}`),
 * adaptée à un cas réel de l'architecture existante : `userId` est OPTIONNEL, car le pipeline
 * Analysis (`ProcessAnalysisJobUseCase`, job asynchrone) ne porte aucune identité d'acteur jusqu'au
 * bout (`AnalysisJob` ne trace qu'un `triggeredByRole`, jamais un `triggeredByUserId` — un vrai fait
 * architectural, jamais une omission) : sans `userId`, la résolution reste TOUJOURS `DEFAULT`, aucun
 * override utilisateur ne peut s'appliquer pour ce pipeline précis (documenté explicitement dans le
 * rapport final plutôt que réécrit `AnalysisJob` pour inventer une identité — mission §31 "ne pas
 * réécrire le use case métier").
 *
 * Précédence (mission §14, ce routeur n'est JAMAIS consulté si une `RoutingPolicy` org-admin est
 * active pour cette tâche — voir chaque `resolveModelForXxx`, qui garde ce niveau de précédence
 * inchangé, exactement comme avant ce checkpoint) :
 *   1. Override utilisateur explicite, SI compatible avec la tâche (mission §12/§36 — sinon ignoré,
 *      jamais une dégradation silencieuse : retombe directement sur le défaut).
 *   2. Défaut de la matrice de routing (`DEFAULT_ROUTING_MATRIX`), toujours NANO ou MINI.
 *
 * La lecture de préférence est best-effort (mission — même discipline que `RoutingPolicyResolver`
 * dans les 4 consommateurs existants) : une erreur ne fait JAMAIS échouer la résolution, seulement
 * revenir au défaut de la tâche.
 */
@Injectable()
export class AiModelRouter {
  private readonly logger = new Logger(AiModelRouter.name);

  constructor(@Optional() @Inject(AI_MODEL_PREFERENCE_REPOSITORY) private readonly preferenceRepository?: AiModelPreferenceRepository) {}

  async resolve(input: { taskType: AiTaskType; organizationId: string; userId?: string | undefined }): Promise<AiModelRoutingResult> {
    const override = await this.resolveUserOverride(input);
    const model = override ?? DEFAULT_ROUTING_MATRIX[input.taskType];
    const resolution: AiModelRoutingResolution = override ? "USER_OVERRIDE" : "DEFAULT";
    const catalogEntry = AI_ROUTING_MODEL_CATALOG[model];
    return { provider: catalogEntry.provider, model, modelKey: catalogEntry.modelKey, resolution };
  }

  private async resolveUserOverride(input: { taskType: AiTaskType; organizationId: string; userId?: string | undefined }): Promise<AiRoutingModel | undefined> {
    if (!input.userId || !this.preferenceRepository) return undefined;
    try {
      const preference = await this.preferenceRepository.findOne({ userId: input.userId, organizationId: input.organizationId, taskType: input.taskType });
      if (!preference) return undefined;
      // Défense en profondeur (mission §37) — la matrice a pu évoluer depuis l'écriture de cette
      // préférence : un override devenu incompatible est ignoré ici, jamais appliqué en dégradant
      // silencieusement la tâche.
      if (!isOverrideCompatible(input.taskType, preference.modelOverride)) return undefined;
      return preference.modelOverride;
    } catch (error) {
      this.logger.warn(`AI model preference lookup failed for task ${input.taskType} (falling back to the default routing matrix): ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}
