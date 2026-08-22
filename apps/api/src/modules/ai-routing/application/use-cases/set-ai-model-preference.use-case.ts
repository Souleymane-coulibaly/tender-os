import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AI_TASK_TYPES, type AiTaskType } from "../../../../shared-kernel/ai-task-type";
import { assertHasAiRoutingPermission, AiRoutingPermission } from "../../domain/ai-routing-permission";
import { isAiRoutingModel, type AiRoutingModel } from "../../domain/ai-routing-model";
import { isOverrideCompatible } from "../../domain/default-routing-matrix";
import { IncompatibleModelOverrideError, UnknownAiTaskTypeError } from "../../domain/errors";
import { AI_MODEL_PREFERENCE_REPOSITORY, type AiModelPreferenceRepository } from "../ports/ai-model-preference.repository";

export type SetAiModelPreferenceCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  taskType: string;
  modelOverride: string;
}>;

/** Mission §11/§12/§36 — écrit un override EXPLICITE (jamais "AUTO", voir le port). Refuse un
 *  override incompatible avec la tâche AVANT toute écriture (mission §36 — "backend refuse OU
 *  ignore proprement" : cette implémentation choisit REFUSER, un message clair immédiat valant
 *  mieux qu'une valeur stockée mais silencieusement ignorée plus tard à la résolution). */
@Injectable()
export class SetAiModelPreferenceUseCase {
  constructor(
    @Inject(AI_MODEL_PREFERENCE_REPOSITORY) private readonly repository: AiModelPreferenceRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetAiModelPreferenceCommand): Promise<void> {
    assertHasAiRoutingPermission(command.actorRole, AiRoutingPermission.ManageOwnPreferences);

    if (!AI_TASK_TYPES.includes(command.taskType as AiTaskType)) {
      throw new UnknownAiTaskTypeError(command.taskType);
    }
    const taskType = command.taskType as AiTaskType;

    if (!isAiRoutingModel(command.modelOverride)) {
      throw new IncompatibleModelOverrideError(taskType, command.modelOverride);
    }
    const modelOverride: AiRoutingModel = command.modelOverride;

    if (!isOverrideCompatible(taskType, modelOverride)) {
      throw new IncompatibleModelOverrideError(taskType, modelOverride);
    }

    await this.repository.set({
      id: this.idGenerator.generate(),
      userId: command.actorId,
      organizationId: command.organizationId,
      taskType,
      modelOverride,
      occurredAt: this.clock.now(),
    });
  }
}
