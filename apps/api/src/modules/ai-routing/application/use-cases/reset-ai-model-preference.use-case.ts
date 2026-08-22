import { Inject, Injectable } from "@nestjs/common";
import { AI_TASK_TYPES, type AiTaskType } from "../../../../shared-kernel/ai-task-type";
import { assertHasAiRoutingPermission, AiRoutingPermission } from "../../domain/ai-routing-permission";
import { UnknownAiTaskTypeError } from "../../domain/errors";
import { AI_MODEL_PREFERENCE_REPOSITORY, type AiModelPreferenceRepository } from "../ports/ai-model-preference.repository";

export type ResetAiModelPreferenceCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; taskType: string }>;

/** Mission §10 — "reset vers AUTOMATIC" = suppression de la ligne, jamais une valeur "AUTO" écrite.
 *  Idempotent : reset une tâche déjà en AUTOMATIC ne fait rien d'observable. */
@Injectable()
export class ResetAiModelPreferenceUseCase {
  constructor(@Inject(AI_MODEL_PREFERENCE_REPOSITORY) private readonly repository: AiModelPreferenceRepository) {}

  async execute(command: ResetAiModelPreferenceCommand): Promise<void> {
    assertHasAiRoutingPermission(command.actorRole, AiRoutingPermission.ManageOwnPreferences);

    if (!AI_TASK_TYPES.includes(command.taskType as AiTaskType)) {
      throw new UnknownAiTaskTypeError(command.taskType);
    }

    await this.repository.reset({ userId: command.actorId, organizationId: command.organizationId, taskType: command.taskType as AiTaskType });
  }
}
