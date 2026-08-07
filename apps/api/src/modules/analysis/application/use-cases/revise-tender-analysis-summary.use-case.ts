import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { TenderBusinessAnalysisNotFoundError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository } from "../ports/business-analysis.repository";
import {
  TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY,
  type TenderAnalysisSummaryRevisionRecord,
  type TenderAnalysisSummaryRevisionRepository,
} from "../ports/tender-analysis-summary-revision.repository";

export type ReviseTenderAnalysisSummaryCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  opportunitySummary?: string | undefined;
  complexityLevel?: string | undefined;
  mainCriteria?: readonly string[] | undefined;
  mainRisks?: readonly string[] | undefined;
  mainObligations?: readonly string[] | undefined;
  missingElements?: readonly string[] | undefined;
  pointsToClarify?: readonly string[] | undefined;
  conflicts?: unknown;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * V2 Sprint 4 — révision utilisateur de la synthèse IA (mission "l'IA doit... produire des réponses
 * vérifiables" appliqué à la synthèse : un utilisateur peut la corriger, mais l'original IA reste
 * intact et consultable pour toujours via `GetTenderBusinessAnalysisUseCase` /
 * `BusinessAnalysisRepository.getSummary` — cette révision ne le modifie ni ne le remplace, elle
 * s'AJOUTE comme une nouvelle ligne append-only, exactement comme `AnalysisAttempt`).
 *
 * Ne recalcule et ne fusionne rien : `fieldName` non fourni = "je ne corrige pas ce champ", jamais
 * une valeur par défaut fabriquée à sa place (chaque champ de `TenderAnalysisSummaryRevision` est
 * nullable pour cette raison).
 */
@Injectable()
export class ReviseTenderAnalysisSummaryUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
    @Inject(TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY) private readonly revisionRepository: TenderAnalysisSummaryRevisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ReviseTenderAnalysisSummaryCommand): Promise<TenderAnalysisSummaryRevisionRecord> {
    // Réviser une synthèse est un acte éditorial actif, jamais accordé à un simple lecteur — même
    // permission que déclencher une analyse ou mapper des suggestions (Trigger).
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Trigger);

    await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const baseSummary = await this.businessAnalysisRepository.getLatestSummary({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!baseSummary) {
      throw new TenderBusinessAnalysisNotFoundError();
    }

    const now = this.clock.now();
    const revision = await this.revisionRepository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      baseSummaryId: baseSummary.id,
      opportunitySummary: command.opportunitySummary,
      complexityLevel: command.complexityLevel,
      mainCriteria: command.mainCriteria,
      mainRisks: command.mainRisks,
      mainObligations: command.mainObligations,
      missingElements: command.missingElements,
      pointsToClarify: command.pointsToClarify,
      conflicts: command.conflicts,
      editedByUserId: command.actorId,
      editedAt: now,
      reason: command.reason,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "analysis.summary_revised",
      resourceType: "tender_analysis_summary",
      resourceId: baseSummary.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, revisionId: revision.id, revisionNumber: revision.revisionNumber },
    });

    return revision;
  }
}
