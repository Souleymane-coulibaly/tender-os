import { Inject, Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase } from "../../../analysis";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GO_NO_GO_REPORT_REPOSITORY, withGoNoGoFreshness, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

export type ListGoNoGoReportsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Historique complet des versions, la plus récente d'abord (mission §29). Checkpoint
 *  2.1-P2.1-FIX-C — chaque version reçoit sa propre fraîcheur (`freshness`) calculée contre
 *  l'analyse effective COURANTE, jamais une seule valeur "globale" appliquée à tout l'historique
 *  (mission §14 "les deux doivent rester auditables", chaque report reste distinctement CURRENT ou
 *  STALE). */
@Injectable()
export class ListGoNoGoReportsUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
  ) {}

  async execute(query: ListGoNoGoReportsQuery): Promise<GoNoGoReportRecord[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    const versions = await this.repository.listVersions({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (versions.length === 0) return [];

    // Même invariant que `GetGoNoGoReportUseCase` — une analyse a nécessairement déjà réussi si au
    // moins un rapport existe.
    const currentAnalysisSummary = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    return versions.map((version) =>
      withGoNoGoFreshness(version, {
        currentCandidateCompanyId: tender.candidateCompanyId,
        currentAnalysisVersion: currentAnalysisSummary.analysisVersion,
        currentAnalysisFreshness: currentAnalysisSummary.analysisFreshness,
      }),
    );
  }
}
