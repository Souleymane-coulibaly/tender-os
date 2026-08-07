import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { GetEffectiveTenderAnalysisSummaryUseCase, ListTenderClausesUseCase, ListTenderCriteriaUseCase, ListTenderRequirementsUseCase, ListTenderRisksUseCase } from "../../../analysis";
import { AiSuggestionStatus, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetCompanyProfileUseCase } from "../../../company-profile";
import { DceNotFoundError, ListDceDocumentsUseCase } from "../../../dce";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import {
  assertHasTenderPermission,
  GetTenderUseCase,
  REQUESTED_DOCUMENT_REPOSITORY,
  RequestedDocumentStatus,
  TENDER_LOT_REPOSITORY,
  TenderPermission,
  type RequestedDocumentRepository,
  type TenderLotRepository,
} from "../../../tenders";
import { bucketRiskSeverity, computeGoNoGoReport } from "../../domain/scoring/compute-go-no-go-report";
import { mapCompanyProfileToQuickScoreInput } from "../mappers/company-profile-to-quick-score-input.mapper";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GO_NO_GO_REPORT_REPOSITORY, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

export type GenerateGoNoGoReportCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Version du calculateur Niveau 2 — même motif que `QUICK_SCORE_CALCULATION_VERSION` (Niveau 1),
 *  jamais un recalcul silencieux d'un ancien rapport sous une nouvelle logique (mission §29). */
const GO_NO_GO_REPORT_CALCULATION_VERSION = "1.0.0";

const FINDINGS_PAGE_LIMIT = 1000;

const SUBCONTRACTING_KEYWORDS = ["sous-traitance", "sous-traitant", "groupement", "cotraitance", "co-traitance", "consortium"];

/**
 * Orchestrateur Niveau 2 — exige qu'une analyse IA du DCE ait déjà réussi (mission §14, porte
 * d'entrée via `GetEffectiveTenderAnalysisSummaryUseCase`, propage `TenderBusinessAnalysisNotFoundError`
 * si aucune n'existe), agrège les Findings validés, les suggestions IA ACCEPTED/MODIFIED
 * uniquement (jamais PENDING/REJECTED comme vérité métier, mission §15), le profil entreprise
 * candidate, les pièces demandées et la volumétrie DCE/lots, puis persiste un NOUVEAU
 * `GoNoGoReport` (jamais un écrasement, mission §29).
 */
@Injectable()
export class GenerateGoNoGoReportUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly requestedDocumentRepository: RequestedDocumentRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderRisksUseCase: ListTenderRisksUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly listAiSuggestionsUseCase: ListAiSuggestionsUseCase,
    private readonly listDceDocumentsUseCase: ListDceDocumentsUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
  ) {}

  async execute(command: GenerateGoNoGoReportCommand): Promise<GoNoGoReportRecord> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageGoNoGo);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    // Porte d'entrée Niveau 2 (mission §14) — propage `TenderBusinessAnalysisNotFoundError` si
    // aucune analyse DCE n'a encore réussi (mappée en HTTP par le filtre d'erreurs du module).
    const analysisSummary = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const findingsQuery = { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, limit: FINDINGS_PAGE_LIMIT, offset: 0 };

    const [requirements, criteria, risks, clauses, aiSuggestions, requestedDocuments, lots, companyProfile] = await Promise.all([
      this.listTenderRequirementsUseCase.execute(findingsQuery),
      this.listTenderCriteriaUseCase.execute(findingsQuery),
      this.listTenderRisksUseCase.execute(findingsQuery),
      this.listTenderClausesUseCase.execute(findingsQuery),
      this.listAiSuggestionsUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, parentTenderId: command.tenderId }),
      this.requestedDocumentRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId }),
      this.tenderLotRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId }),
      this.getCompanyProfileUseCase.execute({ organizationId: command.organizationId, clientAccountId: tender.clientAccountId, actorId: command.actorId, actorRole: command.actorRole }),
    ]);

    let dceDocumentCount = 0;
    try {
      const dceDocuments = await this.listDceDocumentsUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
      dceDocumentCount = dceDocuments.length;
    } catch (error) {
      if (!(error instanceof DceNotFoundError)) throw error;
    }

    const providedStatuses = new Set<RequestedDocumentStatus>([RequestedDocumentStatus.Provided, RequestedDocumentStatus.Validated]);
    const requiredDocs = requestedDocuments.filter((doc) => doc.required);
    const eliminatoryDocs = requestedDocuments.filter((doc) => doc.isEliminatory);

    const risksBucketed = risks.items.map((risk) => bucketRiskSeverity(risk.severity));

    const subcontractingFlags = clauses.items
      .filter((clause) => SUBCONTRACTING_KEYWORDS.some((keyword) => clause.summary.toLowerCase().includes(keyword)))
      .map((clause) => clause.summary);

    const now = this.clock.now();

    const result = computeGoNoGoReport({
      now,
      submissionDeadline: tender.submissionDeadline ? new Date(tender.submissionDeadline) : undefined,
      analysis: {
        complexityLevel: analysisSummary.complexityLevel,
        mainRisksCount: analysisSummary.mainRisks.length,
        mainObligationsCount: analysisSummary.mainObligations.length,
        missingElementsCount: analysisSummary.missingElements.length,
        pointsToClarifyCount: analysisSummary.pointsToClarify.length,
        goNoGoRecommendation: analysisSummary.goNoGoRecommendation,
        goNoGoRationale: analysisSummary.goNoGoRationale,
      },
      findings: {
        requirementsTotal: requirements.items.length,
        requirementsMandatory: requirements.items.filter((r) => r.isMandatory).length,
        criteriaTotal: criteria.items.length,
        criteriaEliminatory: criteria.items.filter((c) => c.isEliminatory).length,
        risksTotal: risks.items.length,
        risksHigh: risksBucketed.filter((s) => s === "HIGH").length,
        risksCritical: risksBucketed.filter((s) => s === "CRITICAL").length,
      },
      requestedDocuments: {
        total: requestedDocuments.length,
        required: requiredDocs.length,
        eliminatory: eliminatoryDocs.length,
        eliminatoryUnprovided: eliminatoryDocs.filter((doc) => !providedStatuses.has(doc.status)).length,
        requiredUnprovided: requiredDocs.filter((doc) => !providedStatuses.has(doc.status)).length,
      },
      dceDocumentCount,
      lots: { total: lots.length, selectedForResponse: lots.filter((lot) => lot.selectedForResponse).length },
      aiSuggestions: {
        accepted: aiSuggestions.filter((s) => s.status === AiSuggestionStatus.Accepted).length,
        modified: aiSuggestions.filter((s) => s.status === AiSuggestionStatus.Modified).length,
        pending: aiSuggestions.filter((s) => s.status === AiSuggestionStatus.Pending).length,
        rejected: aiSuggestions.filter((s) => s.status === AiSuggestionStatus.Rejected).length,
        total: aiSuggestions.length,
      },
      // `Tender` n'a pas de champ "secteur" (contrairement à `Opportunity`) — le rapprochement
      // référence/secteur reste donc non applicable au Niveau 2 (limitation assumée, cohérente
      // avec le texte libre non structuré de `CompanyReference.sector`, voir le plan Sprint 5).
      companyProfile: mapCompanyProfileToQuickScoreInput(companyProfile, undefined),
      subcontractingFlags,
    });

    const record = await this.repository.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      analysisVersion: analysisSummary.analysisVersion,
      calculationVersion: GO_NO_GO_REPORT_CALCULATION_VERSION,
      requestedByUserId: command.actorId,
      generatedAt: now,
      result,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.go_no_go_report_generated",
      resourceType: "tender",
      resourceId: command.tenderId,
      requestId: command.requestId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "GoNoGoReportGenerated",
          aggregateType: "Tender",
          aggregateId: command.tenderId,
          payload: { tenderId: command.tenderId, reportVersion: record.reportVersion, globalScore: record.globalScore, recommendation: record.recommendation },
          occurredAt: now,
        },
      ],
    });

    return record;
  }
}
