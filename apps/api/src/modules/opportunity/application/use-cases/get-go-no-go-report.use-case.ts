import { Inject, Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase } from "../../../analysis";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GoNoGoReportNotFoundError } from "../../domain/errors";
import { GO_NO_GO_REPORT_REPOSITORY, withGoNoGoFreshness, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

export type GetGoNoGoReportQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Checkpoint 2.1-P2.1-FIX-C — la fraîcheur (`freshness`/`candidateStale`/`analysisStale`/
 *  `dceStale`) est calculée ICI À LA LECTURE, jamais persistée : une nouvelle analyse ou un
 *  changement de Candidate n'invalide jamais rétroactivement le rapport lui-même (mission §7
 *  "historique préservé"), seulement ce que cette lecture EN DIT. */
@Injectable()
export class GetGoNoGoReportUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
  ) {}

  async execute(query: GetGoNoGoReportQuery): Promise<GoNoGoReportRecord> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    const latest = await this.repository.getLatest({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!latest) {
      throw new GoNoGoReportNotFoundError();
    }

    // Un GoNoGoReport n'existe jamais sans qu'une analyse ait déjà réussi (porte Niveau 2, mission
    // §14) et l'historique d'analyse n'est jamais supprimé — cette résolution ne peut donc jamais
    // échouer pour un Tender qui possède déjà un rapport.
    const currentAnalysisSummary = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    return withGoNoGoFreshness(latest, {
      currentCandidateCompanyId: tender.candidateCompanyId,
      currentAnalysisVersion: currentAnalysisSummary.analysisVersion,
      currentAnalysisFreshness: currentAnalysisSummary.analysisFreshness,
    });
  }
}
