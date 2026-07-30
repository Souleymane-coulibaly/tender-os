import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AnalysisStatus } from "../../domain/analysis-status";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisNotCancellableError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";

export type CancelAnalysisCommand = Readonly<{
  organizationId: string;
  jobId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

const CANCELLABLE_STATUSES = new Set<string>([AnalysisStatus.Pending, AnalysisStatus.Queued, AnalysisStatus.Processing]);

/** Annulation explicite d'un job non terminal (mission §"Cancel Analysis Use Case si cohérent") —
 *  jamais un état terminal (SUCCEEDED/PARTIALLY_SUCCEEDED/FAILED/CANCELLED) ne peut être annulé. */
@Injectable()
export class CancelAnalysisUseCase {
  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CancelAnalysisCommand): Promise<AnalysisJobSummary> {
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Cancel);

    const job = await this.jobRepository.runExclusiveForJob({
      organizationId: command.organizationId,
      jobId: command.jobId,
      fn: async (job) => {
        if (!CANCELLABLE_STATUSES.has(job.status)) {
          throw new AnalysisNotCancellableError({ status: job.status });
        }
        job.cancel(this.clock.now());
        return job;
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "analysis.cancelled",
      resourceType: "analysis_job",
      resourceId: job.id,
      requestId: command.requestId,
    });

    return toAnalysisJobSummary(job);
  }
}
