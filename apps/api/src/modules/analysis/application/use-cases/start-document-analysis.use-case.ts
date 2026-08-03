import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetDocumentAnalysisInputUseCase, type DocumentAnalysisInput } from "../../../extraction";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisAlreadyRunningError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ANALYSIS_DISPATCHER, type AnalysisDispatcher } from "../ports/analysis-dispatcher";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { PROMPT_VERSIONS, PromptKey } from "../ports/prompt-template.port";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";

export type StartDocumentAnalysisCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Empreinte déterministe du corpus d'entrée (mission §"Versionnement" — `inputChecksum`) — dérivée
 *  uniquement des checksums de chunks déjà calculés par Extraction, jamais du contenu lui-même
 *  recopié ici (mission §"Ne stocke pas inutilement l'intégralité des documents ou chunks"). */
function computeInputChecksum(input: DocumentAnalysisInput): string {
  const material = `${input.extractionVersion}:${input.chunks.map((chunk) => chunk.checksum).join(",")}`;
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Démarre une analyse IA d'un document déjà extrait (mission Sprint 4.1) — consomme
 * EXCLUSIVEMENT le contrat applicatif public d'Extraction (`GetDocumentAnalysisInputUseCase`,
 * correction P1-04 Sprint 3) : jamais Prisma, jamais un repository infrastructure, jamais un
 * contrôleur HTTP interne du module Extraction. Idempotent au sens de la mission
 * §"double déclenchement" : un job non terminal déjà en cours pour ce document empêche toute
 * nouvelle création (`ANALYSIS_ALREADY_RUNNING`) ; un déclenchement après un résultat terminal crée
 * une NOUVELLE version, sans jamais écraser l'historique (mission §"Deux analyses de versions
 * différentes doivent pouvoir coexister").
 */
@Injectable()
export class StartDocumentAnalysisUseCase {
  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ANALYSIS_DISPATCHER) private readonly dispatcher: AnalysisDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getDocumentAnalysisInputUseCase: GetDocumentAnalysisInputUseCase,
  ) {}

  async execute(command: StartDocumentAnalysisCommand): Promise<AnalysisJobSummary> {
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Trigger);

    // Erreur cross-module réelle : Analysis délègue à Extraction (GetDocumentAnalysisInputUseCase,
    // contrat public P1-04) et laisse son erreur remonter telle quelle — même motif que
    // ExtractionErrorFilter pour TENDER_NOT_FOUND (voir AnalysisErrorFilter).
    const input = await this.getDocumentAnalysisInputUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      documentId: command.documentId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const job = await this.jobRepository.runExclusiveForTarget({
      organizationId: command.organizationId,
      scope: AnalysisScope.Document,
      targetId: command.documentId,
      fn: async (context) => {
        const active = await context.findActiveByTarget({
          organizationId: command.organizationId,
          scope: AnalysisScope.Document,
          targetId: command.documentId,
        });
        if (active) {
          throw new AnalysisAlreadyRunningError();
        }

        const now = this.clock.now();
        const analysisVersion = await context.getNextVersion({
          organizationId: command.organizationId,
          scope: AnalysisScope.Document,
          targetId: command.documentId,
        });
        const created = AnalysisJob.create({
          id: randomUUID(),
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          dceId: input.dceId,
          documentId: command.documentId,
          scope: AnalysisScope.Document,
          analysisVersion,
          promptVersion: PROMPT_VERSIONS[PromptKey.AnalyzeDocument],
          extractionVersion: input.extractionVersion,
          inputChecksum: computeInputChecksum(input),
          triggeredByRole: command.actorRole,
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
      metadata: { scope: job.scope, documentId: command.documentId, analysisVersion: job.analysisVersion },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, jobId: job.id, requestId: command.requestId });

    return toAnalysisJobSummary(job);
  }
}
