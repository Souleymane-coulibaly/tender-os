import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ExtractionChunkRepository } from "../application/ports/extraction-chunk.repository";
import { ExtractionChunk } from "../domain/extraction-chunk.entity";

@Injectable()
export class PrismaExtractionChunkRepository implements ExtractionChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceChunks(input: {
    organizationId: string;
    documentId: string;
    chunks: readonly ExtractionChunk[];
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.extractionChunk.deleteMany({
        where: { documentId: input.documentId, organizationId: input.organizationId },
      }),
      ...(input.chunks.length > 0
        ? [
            this.prisma.extractionChunk.createMany({
              data: input.chunks.map((chunk) => ({
                id: chunk.id,
                documentId: chunk.documentId,
                organizationId: chunk.organizationId,
                sequence: chunk.sequence,
                pageStart: chunk.pageStart ?? null,
                pageEnd: chunk.pageEnd ?? null,
                sheetName: chunk.sheetName ?? null,
                sectionTitle: chunk.sectionTitle ?? null,
                content: chunk.content,
                characterCount: chunk.characterCount,
                tokenEstimate: chunk.tokenEstimate ?? null,
                checksum: chunk.checksum,
                createdAt: chunk.createdAt,
              })),
            }),
          ]
        : []),
    ]);
  }

  async listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionChunk[]> {
    const records = await this.prisma.extractionChunk.findMany({
      where: { documentId: input.documentId, organizationId: input.organizationId },
      orderBy: { sequence: "asc" },
    });
    return records.map((record) =>
      ExtractionChunk.rehydrate({
        id: record.id,
        documentId: record.documentId,
        organizationId: record.organizationId,
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
      }),
    );
  }

  async countByDocumentId(input: { organizationId: string; documentId: string }): Promise<number> {
    return this.prisma.extractionChunk.count({
      where: { documentId: input.documentId, organizationId: input.organizationId },
    });
  }
}
