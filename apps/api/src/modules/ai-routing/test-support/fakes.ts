import type { AiTaskType } from "../../../shared-kernel/ai-task-type";
import type { AiRoutingModel } from "../domain/ai-routing-model";
import type { AiModelPreferenceRecord, AiModelPreferenceRepository } from "../application/ports/ai-model-preference.repository";

export class InMemoryAiModelPreferenceRepository implements AiModelPreferenceRepository {
  readonly preferences: AiModelPreferenceRecord[] = [];

  async findOne(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<AiModelPreferenceRecord | null> {
    return this.preferences.find((p) => p.userId === input.userId && p.organizationId === input.organizationId && p.taskType === input.taskType) ?? null;
  }

  async listByUser(input: { userId: string; organizationId: string }): Promise<AiModelPreferenceRecord[]> {
    return this.preferences.filter((p) => p.userId === input.userId && p.organizationId === input.organizationId);
  }

  async set(input: { id: string; userId: string; organizationId: string; taskType: AiTaskType; modelOverride: AiRoutingModel; occurredAt: Date }): Promise<void> {
    const index = this.preferences.findIndex((p) => p.userId === input.userId && p.organizationId === input.organizationId && p.taskType === input.taskType);
    const record: AiModelPreferenceRecord = {
      id: index === -1 ? input.id : this.preferences[index]!.id,
      userId: input.userId,
      organizationId: input.organizationId,
      taskType: input.taskType,
      modelOverride: input.modelOverride,
      createdAt: index === -1 ? input.occurredAt : this.preferences[index]!.createdAt,
      updatedAt: input.occurredAt,
    };
    if (index === -1) this.preferences.push(record);
    else this.preferences[index] = record;
  }

  async reset(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<void> {
    const index = this.preferences.findIndex((p) => p.userId === input.userId && p.organizationId === input.organizationId && p.taskType === input.taskType);
    if (index !== -1) this.preferences.splice(index, 1);
  }
}

/** Mirroir des fakes de résilience déjà présents ailleurs (ex. `analysis/test-support/fakes.ts`,
 *  `ThrowingRoutingPolicyResolver`) — preuve que `AiModelRouter` retombe bien sur le défaut de la
 *  matrice quand la lecture de préférence échoue (mission — best-effort, jamais une cause d'échec). */
export class ThrowingAiModelPreferenceRepository implements AiModelPreferenceRepository {
  async findOne(): Promise<AiModelPreferenceRecord | null> {
    throw new Error("AiModelPreferenceRepository.findOne failure (test double).");
  }
  async listByUser(): Promise<AiModelPreferenceRecord[]> {
    throw new Error("AiModelPreferenceRepository.listByUser failure (test double).");
  }
  async set(): Promise<void> {
    throw new Error("AiModelPreferenceRepository.set failure (test double).");
  }
  async reset(): Promise<void> {
    throw new Error("AiModelPreferenceRepository.reset failure (test double).");
  }
}
