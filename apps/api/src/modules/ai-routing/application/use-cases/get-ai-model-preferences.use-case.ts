import { Inject, Injectable } from "@nestjs/common";
import { AI_TASK_TYPES, type AiTaskType } from "../../../../shared-kernel/ai-task-type";
import { assertHasAiRoutingPermission, AiRoutingPermission } from "../../domain/ai-routing-permission";
import { AI_ROUTING_MODEL_CATALOG, type AiRoutingModel } from "../../domain/ai-routing-model";
import { DEFAULT_ROUTING_MATRIX, isOverrideCompatible, TASK_ALLOWED_OVERRIDES } from "../../domain/default-routing-matrix";
import { AI_MODEL_PREFERENCE_REPOSITORY, type AiModelPreferenceRepository } from "../ports/ai-model-preference.repository";

export type GetAiModelPreferencesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string }>;

export type AiModelPreferenceView = Readonly<{
  taskType: AiTaskType;
  /** `null` = AUTOMATIC (mission §10 — jamais une troisième valeur "AUTO" stockée ou renvoyée comme
   *  un modèle). */
  override: AiRoutingModel | null;
  defaultModel: AiRoutingModel;
  effectiveModel: AiRoutingModel;
  allowedOverrides: readonly AiRoutingModel[];
}>;

/** Mission §16 — alimente l'écran "IA / Modèles" : une ligne par TaskType réel, avec ce qui est
 *  RÉELLEMENT appliqué aujourd'hui (jamais seulement la préférence brute — un override devenu
 *  incompatible depuis son enregistrement, mission §37, doit apparaître comme inactif ici aussi,
 *  jamais une UI qui prétend un override actif alors que le Router l'ignore silencieusement). UNE
 *  seule requête groupée (`listByUser`), jamais une par TaskType (21 tâches réelles aujourd'hui). */
@Injectable()
export class GetAiModelPreferencesUseCase {
  constructor(@Inject(AI_MODEL_PREFERENCE_REPOSITORY) private readonly repository: AiModelPreferenceRepository) {}

  async execute(query: GetAiModelPreferencesQuery): Promise<AiModelPreferenceView[]> {
    assertHasAiRoutingPermission(query.actorRole, AiRoutingPermission.ManageOwnPreferences);

    const preferences = await this.repository.listByUser({ userId: query.actorId, organizationId: query.organizationId });
    const byTaskType = new Map(preferences.map((p) => [p.taskType, p.modelOverride]));

    return AI_TASK_TYPES.map((taskType) => {
      const defaultModel = DEFAULT_ROUTING_MATRIX[taskType];
      const stored = byTaskType.get(taskType);
      const activeOverride = stored && isOverrideCompatible(taskType, stored) ? stored : undefined;
      return {
        taskType,
        override: activeOverride ?? null,
        defaultModel,
        effectiveModel: activeOverride ?? defaultModel,
        allowedOverrides: TASK_ALLOWED_OVERRIDES[taskType],
      };
    });
  }
}

export function toAiModelPreferenceSummary(view: AiModelPreferenceView) {
  return {
    taskType: view.taskType,
    override: view.override,
    defaultModel: view.defaultModel,
    effectiveModel: view.effectiveModel,
    allowedOverrides: view.allowedOverrides,
    effectiveModelLabel: AI_ROUTING_MODEL_CATALOG[view.effectiveModel].displayName,
  };
}
