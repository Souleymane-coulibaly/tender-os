import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { assertAnalysisIsRetryable } from "../policies/analysis-retry.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ANALYSIS_DISPATCHER, type AnalysisDispatcher } from "../ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";
import { ANALYSIS_CONFIG, type AnalysisConfig } from "../../infrastructure/analysis-config";

export type RetryAnalysisCommand = Readonly<{
  organizationId: string;
  jobId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Relance explicite d'un job d'analyse FAILED (mission §"reprise après erreur") — mêmes garanties
 * que `RetryDocumentExtractionUseCase` (module Extraction) : jamais automatique, jamais un nouveau
 * job/une nouvelle version (voir `AnalysisJob.resetForRetry` — la même ligne, le même
 * `analysisVersion`, un nouvel `attemptCount` à la prochaine réservation).
 */
@Injectable()
export class RetryAnalysisUseCase {
  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ANALYSIS_DISPATCHER) private readonly dispatcher: AnalysisDispatcher,
    @Inject(ANALYSIS_CONFIG) private readonly config: AnalysisConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RetryAnalysisCommand): Promise<AnalysisJobSummary> {
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Trigger);

    const job = await this.jobRepository.runExclusiveForJob({
      organizationId: command.organizationId,
      jobId: command.jobId,
      fn: async (job) => {
        assertAnalysisIsRetryable(job, this.config.aiMaxRetries);
        job.resetForRetry(this.clock.now());
        return job;
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "analysis.retry_requested",
      resourceType: "analysis_job",
      resourceId: job.id,
      requestId: command.requestId,
      metadata: { attemptCount: job.attemptCount },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, jobId: job.id, requestId: command.requestId });

    return toAnalysisJobSummary(job);
  }
}
