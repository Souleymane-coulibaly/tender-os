import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { KnowledgeChunk } from "../domain/knowledge-chunk.entity";
import type { KnowledgeChunkRepository } from "../application/ports/knowledge-chunk.repository";

function toDomain(record: {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  knowledgeDocumentId: string;
  sequence: number;
  pageStart: number | null;
  pageEnd: number | null;
  sheetName: string | null;
  sectionTitle: string | null;
  content: string;
  characterCount: number;
  tokenEstimate: number | null;
  checksum: string;
  createdAt: Date;
}): KnowledgeChunk {
  return KnowledgeChunk.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    knowledgeEntryId: record.knowledgeEntryId,
    knowledgeDocumentId: record.knowledgeDocumentId,
    sequence: record.sequence,
    pageStart: record.pageStart ?? undefined,
    pageEnd: record.pageEnd ?? undefined,
    sheetName: record.sheetName ?? undefined,
    sectionTitle: record.sectionTitle ?? undefined,
    content: record.content,
    characterCount: record.characterCount,
    tokenEstimate: record.tokenEstimate ?? undefined,
    checksum: record.checksum,
    createdAt: record.createdAt,
  });
}

@Injectable()
export class PrismaKnowledgeChunkRepository implements KnowledgeChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByDocumentId(input: { organizationId: string; knowledgeDocumentId: string }): Promise<readonly KnowledgeChunk[]> {
    const records = await this.prisma.knowledgeChunk.findMany({
      where: { organizationId: input.organizationId, knowledgeDocumentId: input.knowledgeDocumentId },
      orderBy: { sequence: "asc" },
    });
    return records.map(toDomain);
  }

  async findBySequence(input: { organizationId: string; knowledgeDocumentId: string; sequence: number }): Promise<KnowledgeChunk | null> {
    const record = await this.prisma.knowledgeChunk.findFirst({
      where: { organizationId: input.organizationId, knowledgeDocumentId: input.knowledgeDocumentId, sequence: input.sequence },
    });
    return record ? toDomain(record) : null;
  }
}
