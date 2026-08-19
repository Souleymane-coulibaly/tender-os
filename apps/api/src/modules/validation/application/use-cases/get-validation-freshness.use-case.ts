import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetEffectiveTenderAnalysisSummaryUseCase, TenderBusinessAnalysisNotFoundError, type AnalysisFreshness } from "../../../analysis";
import { GetTechnicalMemoRevisionFingerprintForTenderUseCase } from "../../../technical-memo";
import { GetTenderUseCase } from "../../../tenders";
import { computeValidationFreshness, ValidationFreshness } from "../../domain/validation-freshness";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../ports/final-approval.repository";

export type GetValidationFreshnessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

export type ValidationFreshnessResult = Readonly<{
  freshness: ValidationFreshness;
  hasActiveApproval: boolean;
  activeApprovalId: string | undefined;
  currentAnalysisVersion: number | undefined;
  currentAnalysisFreshness: AnalysisFreshness | undefined;
}>;

/**
 * Checkpoint 2.1-P2.1-FIX-E — jamais persistée, recalculée à chaque lecture (même discipline que
 * FIX-A..D) : charge la `FinalApproval` ACTIVE la plus récente pour ce tender (`findActiveForTender`,
 * déjà scopée `status = ACTIVE`), puis compare sa provenance figée à l'état COURANT (Candidate,
 * Analyse effective, empreinte des révisions du Technical Memo) via `computeValidationFreshness`.
 */
@Injectable()
export class GetValidationFreshnessUseCase {
  constructor(
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly getTechnicalMemoRevisionFingerprintForTenderUseCase: GetTechnicalMemoRevisionFingerprintForTenderUseCase,
  ) {}

  async execute(query: GetValidationFreshnessQuery): Promise<ValidationFreshnessResult> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const approval = await this.finalApprovalRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId });

    let currentAnalysisVersion: number | undefined;
    let currentAnalysisFreshness: AnalysisFreshness | undefined;
    try {
      const analysis = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
      currentAnalysisVersion = analysis.analysisVersion;
      currentAnalysisFreshness = analysis.analysisFreshness;
    } catch (error) {
      if (!(error instanceof TenderBusinessAnalysisNotFoundError)) throw error;
    }

    const currentTechnicalMemoRevisionFingerprint = await this.getTechnicalMemoRevisionFingerprintForTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    const freshness = computeValidationFreshness({
      approval: approval
        ? { candidateCompanyId: approval.candidateCompanyId, analysisVersion: approval.analysisVersion, technicalMemoRevisionFingerprint: approval.technicalMemoRevisionFingerprint }
        : null,
      currentCandidateCompanyId: tender.candidateCompanyId,
      currentAnalysisVersion,
      currentAnalysisFreshness,
      currentTechnicalMemoRevisionFingerprint,
    });

    return { freshness, hasActiveApproval: approval !== null, activeApprovalId: approval?.id, currentAnalysisVersion, currentAnalysisFreshness };
  }
}
