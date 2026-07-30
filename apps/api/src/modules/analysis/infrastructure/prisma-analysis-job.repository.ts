import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AnalysisScope } from "../domain/analysis-scope";
import { AnalysisStatus } from "../domain/analysis-status";
import { AnalysisNotFoundError } from "../domain/errors";
import type { AnalysisJob } from "../domain/analysis-job.aggregate";
import type {
  AnalysisJobRepository,
  ExclusiveTargetContext,
  FinalizeAttemptOutcome,
  ReservationOutcome,
} from "../application/ports/analysis-job.repository";
import { toDomain, toPersistence } from "./analysis-job.persistence-mapper";

/** Transactions volontairement COURTES (même motif que `PrismaDocumentExtractionRepository`,
 *  module Extraction, correction P1-02) — jamais dimensionnées pour tenir un appel provider. */
const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;

const NON_TERMINAL_STATUSES: readonly string[] = [
  AnalysisStatus.Pending,
  AnalysisStatus.Queued,
  AnalysisStatus.Processing,
];

@Injectable()
export class PrismaAnalysisJobRepository implements AnalysisJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; jobId: string }): Promise<AnalysisJob | null> {
    const record = await this.prisma.analysisJob.findFirst({
      where: { id: input.jobId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async save(job: AnalysisJob): Promise<void> {
    const data = toPersistence(job);
    await this.prisma.analysisJob.update({ where: { id: data.id }, data });
  }

  async reserveForProcessing(input: {
    organizationId: string;
    jobId: string;
    occurredAt: Date;
  }): Promise<ReservationOutcome> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif Postgres scopé au job (même motif que
      // DocumentExtractionRepository.reserveForProcessing) — tenu seulement le temps de cette
      // réservation, jamais pendant l'appel provider (Phase 2, hors transaction).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.jobId}))`;

      const record = await tx.analysisJob.findFirst({
        where: { id: input.jobId, organizationId: input.organizationId },
      });
      if (!record) {
        throw new AnalysisNotFoundError();
      }

      const job = toDomain(record);
      if (job.status !== AnalysisStatus.Queued) {
        return { kind: "not_startable", status: job.status };
      }

      job.reserve(input.occurredAt);
      const data = toPersistence(job);
      await tx.analysisJob.update({ where: { id: data.id }, data });

      return { kind: "reserved", job };
    }, SHORT_TX_OPTIONS);
  }

  async finalizeAttempt(input: {
    organizationId: string;
    jobId: string;
    expectedAttemptCount: number;
    startedAt: Date;
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
    trigger: string;
    retryCount: number;
  }): Promise<{ applied: boolean }> {
    const outcome = input.outcome;

    let jobData: Record<string, unknown>;
    let attemptOutcome: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED";
    if (outcome.kind === "failed") {
      attemptOutcome = "FAILED";
      jobData = {
        status: AnalysisStatus.Failed,
        provider: outcome.provider ?? null,
        model: outcome.model ?? null,
        completedAt: input.occurredAt,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        updatedAt: input.occurredAt,
      };
    } else {
      attemptOutcome = outcome.kind === "succeeded" ? "SUCCEEDED" : "PARTIALLY_SUCCEEDED";
      jobData = {
        status: outcome.kind === "succeeded" ? AnalysisStatus.Succeeded : AnalysisStatus.PartiallySucceeded,
        provider: outcome.provider,
        model: outcome.model,
        completedAt: input.occurredAt,
        durationMs: outcome.durationMs,
        inputTokenCount: outcome.inputTokenCount ?? null,
        outputTokenCount: outcome.outputTokenCount ?? null,
        totalTokenCount: outcome.totalTokenCount ?? null,
        resultSummary: outcome.resultSummary ?? null,
        errorCode: null,
        errorMessage: null,
        updatedAt: input.occurredAt,
      };
    }

    // Correction audit Codex Sprint 4.1 (P1-02) — la ligne AnalysisAttempt est construite une
    // seule fois ici et insérée DANS LA MÊME transaction que la mise à jour du job : si l'insertion
    // échoue (contrainte violée, panne), toute la transaction est annulée et le job ne devient
    // JAMAIS terminal sans l'historique correspondant (il reste PROCESSING, récupérable par un
    // retry manuel — jamais un état terminal silencieusement incomplet).
    const attemptData = {
      id: randomUUID(),
      jobId: input.jobId,
      organizationId: input.organizationId,
      attemptNumber: input.expectedAttemptCount,
      trigger: input.trigger,
      provider: outcome.provider ?? null,
      model: outcome.model ?? null,
      outcome: attemptOutcome,
      startedAt: input.startedAt,
      finishedAt: input.occurredAt,
      durationMs: input.occurredAt.getTime() - input.startedAt.getTime(),
      retryCount: input.retryCount,
      inputTokenCount: outcome.kind !== "failed" ? (outcome.inputTokenCount ?? null) : null,
      outputTokenCount: outcome.kind !== "failed" ? (outcome.outputTokenCount ?? null) : null,
      totalTokenCount: outcome.kind !== "failed" ? (outcome.totalTokenCount ?? null) : null,
      errorCode: outcome.kind === "failed" ? outcome.errorCode : null,
      errorMessage: outcome.kind === "failed" ? outcome.errorMessage : null,
      createdAt: input.occurredAt,
    };

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set (mission §"tentative obsolète") — `attemptCount`/`status=PROCESSING`
      // doivent encore correspondre à la réservation en cours, sinon rien n'est écrit (ni le job,
      // ni la tentative : une finalisation obsolète est intégralement ignorée).
      const result = await tx.analysisJob.updateMany({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          attemptCount: input.expectedAttemptCount,
          status: AnalysisStatus.Processing,
        },
        data: jobData,
      });

      if (result.count === 0) {
        return { applied: false };
      }

      await tx.analysisAttempt.create({ data: attemptData });

      return { applied: true };
    }, SHORT_TX_OPTIONS);
  }

  async runExclusiveForTarget<T>(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
    fn: (context: ExclusiveTargetContext) => Promise<T>;
  }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif scopé à (scope, cible) — préfixé par le scope pour ne jamais faire
      // collision entre un verrou DOCUMENT et un verrou TENDER portant accidentellement le même
      // UUID (mission §"double déclenchement").
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.scope}:${input.targetId}`}))`;

      const context: ExclusiveTargetContext = {
        findActiveByTarget: async (query) => {
          const record = await tx.analysisJob.findFirst({
            where: {
              organizationId: query.organizationId,
              scope: query.scope,
              targetId: query.targetId,
              status: { in: [...NON_TERMINAL_STATUSES] },
            },
          });
          return record ? toDomain(record) : null;
        },
        getNextVersion: async (query) => {
          const latest = await tx.analysisJob.findFirst({
            where: { organizationId: query.organizationId, scope: query.scope, targetId: query.targetId },
            orderBy: { analysisVersion: "desc" },
            select: { analysisVersion: true },
          });
          return (latest?.analysisVersion ?? 0) + 1;
        },
        create: async (job) => {
          const data = toPersistence(job);
          await tx.analysisJob.create({ data });
        },
      };

      return input.fn(context);
    }, SHORT_TX_OPTIONS);
  }

  async runExclusiveForJob<T>(input: {
    organizationId: string;
    jobId: string;
    fn: (job: AnalysisJob) => Promise<T>;
  }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.jobId}))`;

      const record = await tx.analysisJob.findFirst({
        where: { id: input.jobId, organizationId: input.organizationId },
      });
      if (!record) {
        throw new AnalysisNotFoundError();
      }

      const job = toDomain(record);
      const result = await input.fn(job);

      const data = toPersistence(job);
      await tx.analysisJob.update({ where: { id: data.id }, data });

      return result;
    }, SHORT_TX_OPTIONS);
  }
}
