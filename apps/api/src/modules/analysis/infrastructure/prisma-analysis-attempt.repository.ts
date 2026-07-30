import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AnalysisAttempt } from "../domain/analysis-attempt.entity";
import type { AnalysisAttemptRepository } from "../application/ports/analysis-attempt.repository";

@Injectable()
export class PrismaAnalysisAttemptRepository implements AnalysisAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(attempt: AnalysisAttempt): Promise<void> {
    await this.prisma.analysisAttempt.create({
      data: {
        id: attempt.id,
        jobId: attempt.jobId,
        organizationId: attempt.organizationId,
        attemptNumber: attempt.attemptNumber,
        trigger: attempt.trigger,
        provider: attempt.provider ?? null,
        model: attempt.model ?? null,
        outcome: attempt.outcome,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        durationMs: attempt.durationMs,
        retryCount: attempt.retryCount,
        inputTokenCount: attempt.inputTokenCount ?? null,
        outputTokenCount: attempt.outputTokenCount ?? null,
        totalTokenCount: attempt.totalTokenCount ?? null,
        errorCode: attempt.errorCode ?? null,
        errorMessage: attempt.errorMessage ?? null,
        createdAt: attempt.createdAt,
      },
    });
  }

  async listByJobId(input: { organizationId: string; jobId: string }): Promise<AnalysisAttempt[]> {
    const records = await this.prisma.analysisAttempt.findMany({
      where: { organizationId: input.organizationId, jobId: input.jobId },
      orderBy: { attemptNumber: "asc" },
    });
    return records.map((record) =>
      AnalysisAttempt.rehydrate({
        id: record.id,
        jobId: record.jobId,
        organizationId: record.organizationId,
        attemptNumber: record.attemptNumber,
        trigger: record.trigger,
        provider: record.provider ?? undefined,
        model: record.model ?? undefined,
        outcome: record.outcome as "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED",
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
        retryCount: record.retryCount,
        inputTokenCount: record.inputTokenCount ?? undefined,
        outputTokenCount: record.outputTokenCount ?? undefined,
        totalTokenCount: record.totalTokenCount ?? undefined,
        errorCode: record.errorCode ?? undefined,
        errorMessage: record.errorMessage ?? undefined,
        createdAt: record.createdAt,
      }),
    );
  }
}
