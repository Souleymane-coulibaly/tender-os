import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { KnowledgeEntryVersionRepository } from "../application/ports/knowledge-entry-version.repository";
import { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";

function toDomain(record: {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  versionNumber: number;
  reason: string | null;
  snapshot: unknown;
  createdByUserId: string;
  createdAt: Date;
  validatedByUserId: string | null;
  validatedAt: Date | null;
}): KnowledgeEntryVersion {
  return KnowledgeEntryVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    knowledgeEntryId: record.knowledgeEntryId,
    versionNumber: record.versionNumber,
    reason: record.reason ?? undefined,
    snapshot: record.snapshot as KnowledgeEntryVersion["snapshot"],
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    validatedByUserId: record.validatedByUserId ?? undefined,
    validatedAt: record.validatedAt ?? undefined,
  });
}

/** Exportée pour être réutilisée par le chemin atomique (`PrismaKnowledgeEntryRepository.createWithVersionAndTags`,
 *  `PrismaKnowledgeDocumentRepository.createForEntry`) — une seule définition de la forme de
 *  persistance, jamais deux versions divergentes entre le chemin transactionnel et celui-ci. */
export function toKnowledgeEntryVersionPersistence(version: KnowledgeEntryVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    knowledgeEntryId: version.knowledgeEntryId,
    versionNumber: version.versionNumber,
    reason: version.reason ?? null,
    snapshot: version.snapshot as unknown as Prisma.InputJsonValue,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt,
    validatedByUserId: version.validatedByUserId ?? null,
    validatedAt: version.validatedAt ?? null,
  };
}

@Injectable()
export class PrismaKnowledgeEntryVersionRepository implements KnowledgeEntryVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(version: KnowledgeEntryVersion): Promise<void> {
    await this.prisma.knowledgeEntryVersion.create({ data: toKnowledgeEntryVersionPersistence(version) });
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeEntryVersion[]> {
    const records = await this.prisma.knowledgeEntryVersion.findMany({
      where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId },
      orderBy: { versionNumber: "desc" },
    });
    return records.map(toDomain);
  }

  async findByVersionNumber(input: { organizationId: string; knowledgeEntryId: string; versionNumber: number }): Promise<KnowledgeEntryVersion | null> {
    const record = await this.prisma.knowledgeEntryVersion.findFirst({
      where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId, versionNumber: input.versionNumber },
    });
    return record ? toDomain(record) : null;
  }

  async saveValidation(version: KnowledgeEntryVersion): Promise<void> {
    await this.prisma.knowledgeEntryVersion.update({
      where: { id: version.id },
      data: { validatedByUserId: version.validatedByUserId ?? null, validatedAt: version.validatedAt ?? null },
    });
  }
}
