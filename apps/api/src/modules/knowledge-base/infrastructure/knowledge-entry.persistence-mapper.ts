import type { Prisma, KnowledgeEntry as KnowledgeEntryRecord } from "@prisma/client";
import { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import type { KnowledgeCategory } from "../domain/knowledge-category";
import type { KnowledgeEntryStatus } from "../domain/knowledge-entry-status";
import type { KnowledgeSourceType } from "../domain/knowledge-source-type";

export function toDomain(record: KnowledgeEntryRecord): KnowledgeEntry {
  return KnowledgeEntry.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    knowledgeSpaceId: record.knowledgeSpaceId,
    clientAccountId: record.clientAccountId ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    category: record.category as KnowledgeCategory,
    sourceType: record.sourceType as KnowledgeSourceType,
    status: record.status as KnowledgeEntryStatus,
    language: record.language ?? undefined,
    metadata: record.metadata as Record<string, unknown>,
    activeVersionNumber: record.activeVersionNumber,
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(entry: KnowledgeEntry) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    knowledgeSpaceId: entry.knowledgeSpaceId,
    clientAccountId: entry.clientAccountId ?? null,
    title: entry.title,
    description: entry.description ?? null,
    category: entry.category,
    sourceType: entry.sourceType,
    status: entry.status,
    language: entry.language ?? null,
    metadata: entry.metadata as Prisma.InputJsonValue,
    activeVersionNumber: entry.activeVersionNumber,
    createdByUserId: entry.createdByUserId,
    updatedByUserId: entry.updatedByUserId ?? null,
    archivedAt: entry.archivedAt ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
