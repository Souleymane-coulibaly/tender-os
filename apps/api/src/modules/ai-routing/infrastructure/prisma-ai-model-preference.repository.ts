import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AiTaskType } from "../../../shared-kernel/ai-task-type";
import type { AiRoutingModel } from "../domain/ai-routing-model";
import type { AiModelPreferenceRecord, AiModelPreferenceRepository } from "../application/ports/ai-model-preference.repository";

@Injectable()
export class PrismaAiModelPreferenceRepository implements AiModelPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<AiModelPreferenceRecord | null> {
    const row = await this.prisma.currentClient().aiModelPreference.findUnique({
      where: { userId_organizationId_taskType: { userId: input.userId, organizationId: input.organizationId, taskType: input.taskType } },
    });
    return row ? this.toRecord(row) : null;
  }

  async listByUser(input: { userId: string; organizationId: string }): Promise<AiModelPreferenceRecord[]> {
    const rows = await this.prisma.currentClient().aiModelPreference.findMany({ where: { userId: input.userId, organizationId: input.organizationId } });
    return rows.map((row) => this.toRecord(row));
  }

  async set(input: { id: string; userId: string; organizationId: string; taskType: AiTaskType; modelOverride: AiRoutingModel; occurredAt: Date }): Promise<void> {
    await this.prisma.currentClient().aiModelPreference.upsert({
      where: { userId_organizationId_taskType: { userId: input.userId, organizationId: input.organizationId, taskType: input.taskType } },
      create: { id: input.id, userId: input.userId, organizationId: input.organizationId, taskType: input.taskType, modelOverride: input.modelOverride, updatedAt: input.occurredAt },
      update: { modelOverride: input.modelOverride, updatedAt: input.occurredAt },
    });
  }

  async reset(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<void> {
    // Mission §10 — idempotent : `deleteMany` (jamais `delete`) ne lève pas si la ligne n'existe
    // déjà pas (une tâche déjà en AUTOMATIC).
    await this.prisma.currentClient().aiModelPreference.deleteMany({ where: { userId: input.userId, organizationId: input.organizationId, taskType: input.taskType } });
  }

  private toRecord(row: { id: string; userId: string; organizationId: string; taskType: string; modelOverride: string; createdAt: Date; updatedAt: Date }): AiModelPreferenceRecord {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      taskType: row.taskType as AiTaskType,
      modelOverride: row.modelOverride as AiRoutingModel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
