import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisAlreadyRunningError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ANALYSIS_DISPATCHER, type AnalysisDispatcher } from "../ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { CURRENT_PROMPT_VERSION } from "../ports/prompt-template.port";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";

export type StartTenderAnalysisCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Démarre une analyse IA d'un Tender dans son ensemble (mission Sprint 4.1) — Sprint 4.1 ne fournit
 * aucun contrat d'agrégation de corpus multi-documents (hors périmètre, Sprint 4.2) : ce job ne
 * consomme donc qu'une entrée technique minimale (identifiants), jamais un résumé métier du
 * dossier, jamais une extraction de critères/risques/délais/questions (interdictions formelles de
 * la mission).
 */
@Injectable()
export class StartTenderAnalysisUseCase {
  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ANALYSIS_DISPATCHER) private readonly dispatcher: AnalysisDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: StartTenderAnalysisCommand): Promise<AnalysisJobSummary> {
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Trigger);

    await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });

    const job = await this.jobRepository.runExclusiveForTarget({
      organizationId: command.organizationId,
      scope: AnalysisScope.Tender,
      targetId: command.tenderId,
      fn: async (context) => {
        const active = await context.findActiveByTarget({
          organizationId: command.organizationId,
          scope: AnalysisScope.Tender,
          targetId: command.tenderId,
        });
        if (active) {
          throw new AnalysisAlreadyRunningError();
        }

        const now = this.clock.now();
        const analysisVersion = await context.getNextVersion({
          organizationId: command.organizationId,
          scope: AnalysisScope.Tender,
          targetId: command.tenderId,
        });
        const created = AnalysisJob.create({
          id: randomUUID(),
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          scope: AnalysisScope.Tender,
          analysisVersion,
          promptVersion: CURRENT_PROMPT_VERSION,
          occurredAt: now,
        });
        created.queue(now);
        await context.create(created);
        return created;
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "analysis.requested",
      resourceType: "analysis_job",
      resourceId: job.id,
      requestId: command.requestId,
      metadata: { scope: job.scope, tenderId: command.tenderId, analysisVersion: job.analysisVersion },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, jobId: job.id, requestId: command.requestId });

    return toAnalysisJobSummary(job);
  }
}
