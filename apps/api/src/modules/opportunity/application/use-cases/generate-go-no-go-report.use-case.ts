import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { GetEffectiveTenderAnalysisSummaryUseCase, ListTenderClausesUseCase, ListTenderCriteriaUseCase, ListTenderRequirementsUseCase, ListTenderRisksUseCase } from "../../../analysis";
import { AiSuggestionStatus, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { CandidateCompanyRequiredError, ResolveCandidateIdentityUseCase } from "../../../candidate-company";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { ResolveCandidateCapabilitiesUseCase } from "../../../company-profile";
import { DceNotFoundError, ListDceDocumentsUseCase } from "../../../dce";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import {
  assertHasTenderPermission,
  GetTenderUseCase,
  CHECKLIST_ITEM_REPOSITORY,
  TENDER_LOT_REPOSITORY,
  TenderPermission,
  type ChecklistItemRepository,
  type TenderLotRepository,
} from "../../../tenders";
import { GoNoGoAnalysisNotCurrentError } from "../../domain/errors";
import { toChecklistDocumentSignals } from "../../domain/scoring/checklist-document-signals";
import { bucketRiskSeverity, computeGoNoGoReport } from "../../domain/scoring/compute-go-no-go-report";
import { mapCandidateCapabilitiesToQuickScoreInput } from "../mappers/candidate-capabilities-to-quick-score-input.mapper";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GO_NO_GO_REPORT_REPOSITORY, withGoNoGoFreshness, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

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
 *
 * Checkpoint 2.1-A6.2 (Candidate SOT — GO/NO-GO) — même discipline NEW/LEGACY FLOW que
 * `ComputeOpportunityQuickScoreUseCase` (Niveau 1) et qu'A6.1 (Checklist) : `tender.candidateCompanyId`
 * résolu vers une `CandidateCompany` réelle → `companyProfile` n'est jamais chargé depuis le CLIENT
 * (`company-profile` via `clientAccountId`) — les satellites (certifications/assurances/références/
 * moyens) restent structurellement absents de `CandidateCompany` (DEFERRED-BE-02, hors périmètre
 * A6.2), donc honnêtement absents du score plutôt que d'emprunter ceux d'une autre entité juridique.
 *
 * Checkpoint 2.1-P2.1-FIX-C — précondition (mission §28-29/§37) : l'analyse source doit être
 * `CURRENT` (jamais STALE/UNKNOWN) pour générer OU recalculer — cette use case sert les deux cas
 * (toujours un nouvel append-only, jamais un écrasement, donc "recalculer" EST "régénérer" ici).
 * Bloque AVANT tout calcul coûteux, lève `GoNoGoAnalysisNotCurrentError` (jamais un rapport produit
 * sur des Findings déjà obsolètes).
 *
 * Correctif audit P1-FIXC-001 — `reportVersion` est désormais réservé ATOMIQUEMENT juste après
 * cette porte, AVANT le `Promise.all` des Findings/scoring (jamais recalculé dans
 * `repository.create()`, voir `GoNoGoReportRepository.reserveVersion`) : un calcul démarré plus tôt
 * (donc lisant un état DCE/analyse plus ancien) reçoit toujours un `reportVersion` plus petit qu'un
 * calcul démarré plus tard, quel que soit l'ordre de complétion — rend `getLatest()` (`orderBy
 * reportVersion desc`) sûr sans logique de sélection additionnelle consciente de la fraîcheur.
 */
@Injectable()
export class GenerateGoNoGoReportUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
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
    private readonly resolveCandidateIdentityUseCase: ResolveCandidateIdentityUseCase,
    private readonly resolveCandidateCapabilitiesUseCase: ResolveCandidateCapabilitiesUseCase,
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

    // Checkpoint 2.1-P2.1-FIX-C (mission §28-29/§37) — jamais un GO/NO-GO produit à partir d'une
    // analyse STALE (DCE modifié depuis) ou UNKNOWN (fraîcheur non prouvable) : bloqué AVANT tout
    // calcul coûteux, jamais un rapport dont la provenance ne pourrait jamais être présentée CURRENT.
    if (analysisSummary.analysisFreshness !== "CURRENT") {
      throw new GoNoGoAnalysisNotCurrentError();
    }

    // Checkpoint 2.1-P2.1-FIX-C (correctif audit P1-FIXC-001) — réservé ICI, avant le calcul
    // coûteux ci-dessous, jamais recalculé dans `repository.create()`. Voir la documentation du
    // port pour la garantie d'ordre que cela procure (TEST G12, sélection out-of-order).
    const reportVersion = await this.repository.reserveVersion({ organizationId: command.organizationId, tenderId: command.tenderId });

    const findingsQuery = { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, limit: FINDINGS_PAGE_LIMIT, offset: 0 };

    // Checkpoint TENDEROS-2.1-CCV2-G.2 — POLICY A. Noter la capacité à répondre à partir du profil
    // du CLIENT commercial reviendrait à évaluer la mauvaise entreprise : le repli est SUPPRIMÉ.
    // Les rapports GO/NO-GO déjà produits restent lisibles et immuables.
    if (!tender.candidateCompanyId) {
      throw new CandidateCompanyRequiredError();
    }

    const candidateIdentity = await this.resolveCandidateIdentityUseCase.execute({ organizationId: command.organizationId, candidateCompanyId: tender.candidateCompanyId });

    const [requirements, criteria, risks, clauses, aiSuggestions, checklistItems, lots, candidateCapabilities] = await Promise.all([
      this.listTenderRequirementsUseCase.execute(findingsQuery),
      this.listTenderCriteriaUseCase.execute(findingsQuery),
      this.listTenderRisksUseCase.execute(findingsQuery),
      this.listTenderClausesUseCase.execute(findingsQuery),
      this.listAiSuggestionsUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, parentTenderId: command.tenderId }),
      this.checklistItemRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId }),
      this.tenderLotRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId }),
      // NEW FLOW — CandidateCompany fait autorité et ne porte aucune capacité : jamais un repli
      // silencieux sur les satellites du CLIENT (mission A6.2, même discipline qu'A6.1 §9).
      // NEW FLOW (CCV2-E, fermeture de DEFERRED-BE-02) — capacités de la SOT `CandidateCompany`.
      this.resolveCandidateCapabilitiesUseCase.execute({ organizationId: command.organizationId, candidateCompanyId: tender.candidateCompanyId }),
    ]);

    let dceDocumentCount = 0;
    try {
      const dceDocuments = await this.listDceDocumentsUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
      dceDocumentCount = dceDocuments.length;
    } catch (error) {
      if (!(error instanceof DceNotFoundError)) throw error;
    }

    // TENDEROS-2.1 — les pièces sont des éléments de checklist depuis la fusion des « Pièces
    // demandées » : mêmes signaux, même notation, source unique.
    const checklistDocuments = toChecklistDocumentSignals(checklistItems);

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
      checklistDocuments,
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
      // Checkpoint CCV2-E — NEW FLOW : capacités de `CandidateCompany` ; LEGACY FLOW : profil du
      // client. Jamais les deux, jamais l'un à défaut de l'autre.
      // Checkpoint CCV2-G.2 — source UNIQUE : les capacites de l'entreprise candidate.
      companyProfile: mapCandidateCapabilitiesToQuickScoreInput(candidateIdentity, candidateCapabilities, undefined),
      subcontractingFlags,
    });

    const record = await this.repository.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      reportVersion,
      analysisVersion: analysisSummary.analysisVersion,
      // Checkpoint 2.1-P2.1-FIX-C — provenance DCE, voir `GoNoGoReportRecord.dceRevision`.
      dceRevision: analysisSummary.dceRevision,
      calculationVersion: GO_NO_GO_REPORT_CALCULATION_VERSION,
      requestedByUserId: command.actorId,
      generatedAt: now,
      result,
      // Checkpoint 2.1-A6.2 (correctif audit — P2 "fraîcheur candidate") — instantané de la
      // Candidate effectivement utilisée pour CE calcul, jamais re-résolu si elle change ensuite.
      candidateCompanyId: tender.candidateCompanyId,
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

    // Checkpoint 2.1-P2.1-FIX-C — un rapport tout juste généré est TOUJOURS `freshness: "CURRENT"`
    // (la porte ci-dessus vient de le garantir), mais le calcul passe par la même fonction pure que
    // les use cases de lecture (jamais une valeur câblée en dur qui pourrait diverger) : sans ça,
    // la réponse `POST .../go-no-go/report` n'aurait jamais exposé `freshness` du tout (seul le
    // `GET` l'aurait fait), laissant le frontend sans badge jusqu'au prochain rechargement.
    return withGoNoGoFreshness(record, {
      currentCandidateCompanyId: tender.candidateCompanyId,
      currentAnalysisVersion: analysisSummary.analysisVersion,
      currentAnalysisFreshness: analysisSummary.analysisFreshness,
    });
  }
}
