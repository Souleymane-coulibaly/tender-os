import { Inject, Injectable } from "@nestjs/common";
import { CreateAiSuggestionUseCase, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { GetTenderUseCase } from "../../../tenders";
import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisScope } from "../../domain/analysis-scope";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository } from "../ports/business-analysis.repository";
import { mapCriterionFinding, mapDeadlineFinding, mapRequirementFinding, mapRiskFinding, type MappedSuggestion } from "../services/finding-to-suggestion-mapper";
import { resolveLatestAnalysisVersion } from "../services/resolve-latest-analysis-version";

export type MapAnalysisFindingsToAiSuggestionsCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  analysisVersion?: number | undefined;
  requestId?: string | undefined;
}>;

export type MapAnalysisFindingsToAiSuggestionsResult = Readonly<{
  analysisVersion: number | undefined;
  alreadyMapped: boolean;
  createdCount: number;
  skippedCount: number;
}>;

const FINDINGS_PAGE_SIZE = 500;

/**
 * V2 Sprint 4 §9-12 — pont Analysis → AiSuggestion : transforme les constats IA déjà consolidés
 * (Deadline/Criterion/Requirement/Risk) en propositions `AiSuggestion` PENDING, jamais appliquées
 * automatiquement (mission "aucun champ détecté dans le DCE ne doit être injecté silencieusement
 * dans le Tender"). QuestionFinding/ClauseFinding restent purement informatifs (mission §9),
 * jamais mappés ici.
 *
 * Idempotent PAR JOB D'ANALYSE résolu (mission "idempotent par tentative d'analyse") : si des
 * suggestions portant déjà ce `sourceAnalysisAttemptId` existent, aucune nouvelle création n'est
 * tentée — un second appel HTTP sur la même consolidation reste un no-op, jamais des doublons.
 */
@Injectable()
export class MapAnalysisFindingsToAiSuggestionsUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
    private readonly createAiSuggestionUseCase: CreateAiSuggestionUseCase,
    private readonly listAiSuggestionsUseCase: ListAiSuggestionsUseCase,
  ) {}

  async execute(command: MapAnalysisFindingsToAiSuggestionsCommand): Promise<MapAnalysisFindingsToAiSuggestionsResult> {
    // Générer des suggestions est une action active, jamais accordée à un simple lecteur — même
    // permission que déclencher une analyse (Trigger) : aucune permission dédiée supplémentaire
    // n'est justifiée pour ce seul sprint (mission "ne pas ajouter de complexité inutile").
    assertHasAnalysisPermission(command.actorRole, AnalysisPermission.Trigger);

    await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
      actorId: command.actorId,
    });

    const analysisVersion = await resolveLatestAnalysisVersion(this.businessAnalysisRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      requestedVersion: command.analysisVersion,
    });

    if (analysisVersion === undefined) {
      return { analysisVersion: undefined, alreadyMapped: false, createdCount: 0, skippedCount: 0 };
    }

    const job = await this.resolveAnalysisJob(command.organizationId, command.tenderId, analysisVersion);

    if (job && (await this.hasExistingSuggestions(command, job.id))) {
      return { analysisVersion, alreadyMapped: true, createdCount: 0, skippedCount: 0 };
    }

    const [deadlines, criteria, requirements, risks] = await Promise.all([
      this.businessAnalysisRepository.listDeadlines({ organizationId: command.organizationId, tenderId: command.tenderId, analysisVersion, limit: FINDINGS_PAGE_SIZE, offset: 0 }),
      this.businessAnalysisRepository.listCriteria({ organizationId: command.organizationId, tenderId: command.tenderId, analysisVersion, limit: FINDINGS_PAGE_SIZE, offset: 0 }),
      this.businessAnalysisRepository.listRequirements({ organizationId: command.organizationId, tenderId: command.tenderId, analysisVersion, limit: FINDINGS_PAGE_SIZE, offset: 0 }),
      this.businessAnalysisRepository.listRisks({ organizationId: command.organizationId, tenderId: command.tenderId, analysisVersion, limit: FINDINGS_PAGE_SIZE, offset: 0 }),
    ]);

    const mappedDeadlines = deadlines.items.map(mapDeadlineFinding).filter((value): value is MappedSuggestion => value !== null);
    const mappedCriteria = criteria.items.map(mapCriterionFinding).filter((value): value is MappedSuggestion => value !== null);
    const mappedRequirements = requirements.items.map(mapRequirementFinding);
    const mappedRisks = risks.items.map(mapRiskFinding);

    const mapped = [...mappedDeadlines, ...mappedCriteria, ...mappedRequirements, ...mappedRisks];
    const totalFindings = deadlines.items.length + criteria.items.length + requirements.items.length + risks.items.length;
    const skippedCount = totalFindings - mapped.length;

    for (const suggestion of mapped) {
      await this.createAiSuggestionUseCase.execute({
        organizationId: command.organizationId,
        entityType: suggestion.entityType,
        entityId: suggestion.entityId,
        fieldName: suggestion.fieldName,
        parentTenderId: command.tenderId,
        proposedValue: suggestion.proposedValue,
        confidence: suggestion.confidence,
        sourceDocumentId: suggestion.sourceDocumentId,
        sourceDocumentVersionId: suggestion.sourceDocumentVersionId,
        sourcePage: suggestion.sourcePage,
        sourceChunkReference: suggestion.sourceChunkReference,
        sourceAnalysisAttemptId: job?.id,
        aiProvider: job?.provider,
        aiModel: job?.model,
        createdByProcess: "analysis.finding_mapper",
        actorId: command.actorId,
        requestId: command.requestId,
      });
    }

    return { analysisVersion, alreadyMapped: false, createdCount: mapped.length, skippedCount };
  }

  /** Résout le job de consolidation Tender à l'origine de cette `analysisVersion` — sert de
   *  provenance (`sourceAnalysisAttemptId`/`aiProvider`/`aiModel`) et de clé d'idempotence. `null`
   *  dans le seul cas dégénéré où aucun job ne correspond (historique corrompu/tronqué) : le
   *  mapping reste possible, simplement sans provenance ni garde d'idempotence. */
  private async resolveAnalysisJob(organizationId: string, tenderId: string, analysisVersion: number): Promise<AnalysisJob | null> {
    const page = await this.jobRepository.listByTarget({ organizationId, scope: AnalysisScope.Tender, targetId: tenderId, limit: 200, offset: 0 });
    return page.items.find((job) => job.analysisVersion === analysisVersion) ?? null;
  }

  private async hasExistingSuggestions(command: MapAnalysisFindingsToAiSuggestionsCommand, jobId: string): Promise<boolean> {
    const existing = await this.listAiSuggestionsUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      parentTenderId: command.tenderId,
    });
    return existing.some((suggestion) => suggestion.sourceAnalysisAttemptId === jobId);
  }
}
