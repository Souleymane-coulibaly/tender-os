import type { AiModel as AiModelRecord } from "@prisma/client";
import { AiModel } from "../domain/ai-model.aggregate";
import type { AiModelStatus } from "../domain/ai-model-status";

export function toDomain(record: AiModelRecord): AiModel {
  return AiModel.rehydrate({
    id: record.id,
    provider: record.provider,
    modelKey: record.modelKey,
    displayName: record.displayName,
    status: record.status as AiModelStatus,
    capabilities: {
      supportsStructuredOutput: record.capabilitiesStructuredOutput,
      supportsToolCalling: record.capabilitiesToolCalling,
      supportsVision: record.capabilitiesVision,
    },
    maxContextTokens: record.maxContextTokens ?? undefined,
    enabledForBenchmark: record.enabledForBenchmark,
    enabledForProduction: record.enabledForProduction,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(model: AiModel) {
  return {
    id: model.id,
    provider: model.provider,
    modelKey: model.modelKey,
    displayName: model.displayName,
    status: model.status,
    capabilitiesStructuredOutput: model.capabilities.supportsStructuredOutput,
    capabilitiesToolCalling: model.capabilities.supportsToolCalling,
    capabilitiesVision: model.capabilities.supportsVision,
    maxContextTokens: model.maxContextTokens ?? null,
    enabledForBenchmark: model.enabledForBenchmark,
    enabledForProduction: model.enabledForProduction,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}
