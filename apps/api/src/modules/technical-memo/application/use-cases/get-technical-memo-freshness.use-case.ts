import { Inject, Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase, type AnalysisFreshness } from "../../../analysis";
import { ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import {
  computeTechnicalMemoGlobalFreshness,
  computeTechnicalMemoSectionFreshness,
  TechnicalMemoFreshness,
} from "../../domain/technical-memo-freshness";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, type TechnicalMemoSectionRevisionRepository } from "../ports/technical-memo-section-revision.repository";

export type GetTechnicalMemoFreshnessQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
}>;

export type TechnicalMemoSectionFreshnessSummary = Readonly<{
  technicalMemoSectionId: string;
  freshness: TechnicalMemoFreshness;
  candidateStale: boolean;
  analysisStale: boolean | undefined;
}>;

export type TechnicalMemoFreshnessResult = Readonly<{
  freshness: TechnicalMemoFreshness;
  sections: readonly TechnicalMemoSectionFreshnessSummary[];
  currentAnalysisVersion: number | undefined;
  currentAnalysisFreshness: AnalysisFreshness | undefined;
}>;

/**
 * Checkpoint 2.1-P2.1-FIX-D — lecture seule, jamais persistée (même discipline que
 * `GetChecklistFreshnessUseCase`/`GetGoNoGoReportUseCase`). Calcule la fraîcheur de CHAQUE section
 * (à partir de sa DERNIÈRE révision, `null` -> `UNKNOWN` pour une section jamais générée) puis
 * l'agrège en un signal global (mission §28-29 "mixed version risk" — jamais un faux CURRENT sur
 * un mémoire partiellement régénéré). `GetEffectiveTenderAnalysisSummaryUseCase` n'est appelé
 * qu'une seule fois, et UNIQUEMENT si au moins une section a une dépendance Analyse capturée
 * (mission §12/§13 "jamais une dépendance fabriquée").
 */
@Injectable()
export class GetTechnicalMemoFreshnessUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY) private readonly revisionRepository: TechnicalMemoSectionRevisionRepository,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
  ) {}

  async execute(query: GetTechnicalMemoFreshnessQuery): Promise<TechnicalMemoFreshnessResult> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: query.organizationId,
      technicalMemoId: query.technicalMemoId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: memo.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    const sections = await this.sectionRepository.listByMemoId({ organizationId: query.organizationId, technicalMemoId: memo.id });
    const latestRevisions = await Promise.all(
      sections.map((section) => this.revisionRepository.findLatestBySectionId({ organizationId: query.organizationId, technicalMemoSectionId: section.id })),
    );

    const needsAnalysis = latestRevisions.some((revision) => revision?.analysisVersion !== undefined);
    let currentAnalysisVersion: number | undefined;
    let currentAnalysisFreshness: AnalysisFreshness | undefined;
    if (needsAnalysis) {
      const effectiveAnalysis = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({
        organizationId: query.organizationId,
        tenderId: memo.tenderId,
        actorId: query.actorId,
        actorRole: query.actorRole,
      });
      currentAnalysisVersion = effectiveAnalysis.analysisVersion;
      currentAnalysisFreshness = effectiveAnalysis.analysisFreshness;
    }

    const sectionSummaries: TechnicalMemoSectionFreshnessSummary[] = sections.map((section, index) => {
      const revision = latestRevisions[index];
      const freshness = computeTechnicalMemoSectionFreshness({
        latestRevision: revision ? { candidateCompanyId: revision.candidateCompanyId, analysisVersion: revision.analysisVersion } : null,
        currentCandidateCompanyId: tender.candidateCompanyId,
        currentAnalysisVersion,
        currentAnalysisFreshness,
      });
      return {
        technicalMemoSectionId: section.id,
        freshness,
        candidateStale: revision !== null && revision !== undefined && revision.candidateCompanyId !== tender.candidateCompanyId,
        analysisStale: revision?.analysisVersion === undefined ? undefined : revision.analysisVersion !== currentAnalysisVersion || currentAnalysisFreshness !== "CURRENT",
      };
    });

    return {
      freshness: computeTechnicalMemoGlobalFreshness(sectionSummaries.map((s) => s.freshness)),
      sections: sectionSummaries,
      currentAnalysisVersion,
      currentAnalysisFreshness,
    };
  }
}
