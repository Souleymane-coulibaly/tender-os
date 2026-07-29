import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ExtractionAttemptRepository } from "../application/ports/extraction-attempt.repository";
import { ExtractionAttempt, type ExtractionAttemptOutcome } from "../domain/extraction-attempt.entity";
import type { DocumentExtractionStrategy } from "../domain/document-extraction-strategy";

@Injectable()
export class PrismaExtractionAttemptRepository implements ExtractionAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(attempt: ExtractionAttempt): Promise<void> {
    await this.prisma.extractionAttempt.create({
      data: {
        id: attempt.id,
        documentId: attempt.documentId,
        organizationId: attempt.organizationId,
        attemptNumber: attempt.attemptNumber,
        strategy: attempt.strategy,
        outcome: attempt.outcome,
        provider: attempt.provider ?? null,
        providerVersion: attempt.providerVersion ?? null,
        providerRequestId: attempt.providerRequestId ?? null,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        durationMs: attempt.durationMs,
        pageCount: attempt.pageCount ?? null,
        characterCount: attempt.characterCount ?? null,
        chunkCount: attempt.chunkCount ?? null,
        language: attempt.language ?? null,
        warnings: attempt.warnings,
        errorCode: attempt.errorCode ?? null,
        errorMessage: attempt.errorMessage ?? null,
      },
    });
  }

  async listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionAttempt[]> {
    const records = await this.prisma.extractionAttempt.findMany({
      where: { documentId: input.documentId, organizationId: input.organizationId },
      orderBy: { attemptNumber: "asc" },
    });
    return records.map((record) =>
      ExtractionAttempt.rehydrate({
        id: record.id,
        documentId: record.documentId,
        organizationId: record.organizationId,
        attemptNumber: record.attemptNumber,
        strategy: record.strategy as DocumentExtractionStrategy,
        outcome: record.outcome as ExtractionAttemptOutcome,
        provider: record.provider ?? undefined,
        providerVersion: record.providerVersion ?? undefined,
        providerRequestId: record.providerRequestId ?? undefined,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
        pageCount: record.pageCount ?? undefined,
        characterCount: record.characterCount ?? undefined,
        chunkCount: record.chunkCount ?? undefined,
        language: record.language ?? undefined,
        warnings: record.warnings,
        errorCode: record.errorCode ?? undefined,
        errorMessage: record.errorMessage ?? undefined,
      }),
    );
  }
}
