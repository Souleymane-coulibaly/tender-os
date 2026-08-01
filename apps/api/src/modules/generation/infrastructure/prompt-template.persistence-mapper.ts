import type { PromptTemplate as PromptTemplateRecord } from "@prisma/client";
import { PromptTemplate } from "../domain/prompt-template.aggregate";
import type { GenerationOutputMode } from "../domain/generation-output-mode";
import type { GenerationTaskType } from "../domain/generation-task-type";

export function toDomain(record: PromptTemplateRecord): PromptTemplate {
  return PromptTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    taskType: record.taskType as GenerationTaskType,
    name: record.name,
    description: record.description ?? undefined,
    outputMode: record.outputMode as GenerationOutputMode,
    structuredSchemaKey: record.structuredSchemaKey ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(template: PromptTemplate) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    taskType: template.taskType,
    name: template.name,
    description: template.description ?? null,
    outputMode: template.outputMode,
    structuredSchemaKey: template.structuredSchemaKey ?? null,
    archivedAt: template.archivedAt ?? null,
    createdBy: template.createdBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
