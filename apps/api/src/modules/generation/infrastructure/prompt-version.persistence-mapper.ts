import type { PromptVersion as PromptVersionRecord, Prisma } from "@prisma/client";
import { PromptVersion } from "../domain/prompt-version.entity";
import type { PromptVersionStatus } from "../domain/prompt-version-status";

export function toDomain(record: PromptVersionRecord): PromptVersion {
  return PromptVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    promptTemplateId: record.promptTemplateId,
    version: record.version,
    status: record.status as PromptVersionStatus,
    systemPrompt: record.systemPrompt,
    userPromptTemplate: record.userPromptTemplate,
    requiredVariables: record.requiredVariables as string[],
    authorUserId: record.authorUserId,
    effectiveFrom: record.effectiveFrom ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(version: PromptVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    promptTemplateId: version.promptTemplateId,
    version: version.version,
    status: version.status,
    systemPrompt: version.systemPrompt,
    userPromptTemplate: version.userPromptTemplate,
    requiredVariables: version.requiredVariables as unknown as Prisma.InputJsonValue,
    authorUserId: version.authorUserId,
    effectiveFrom: version.effectiveFrom ?? null,
    archivedAt: version.archivedAt ?? null,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}
