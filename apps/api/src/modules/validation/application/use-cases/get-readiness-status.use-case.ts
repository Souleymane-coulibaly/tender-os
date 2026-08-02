import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ReadinessStatus } from "../../domain/readiness-status";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../ports/final-approval.repository";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type GetReadinessStatusQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;
export type ReadinessStatusResult = Readonly<{ status: string; latestValidationRunId?: string | undefined; activeApprovalId?: string | undefined }>;

/**
 * Mission Sprint 8A §27/§30 — calculé EXCLUSIVEMENT côté backend. Ce use case couvre les étapes
 * visibles depuis Validation (jusqu'à APPROVED) ; les étapes ultérieures (READY_FOR_SIGNATURE,
 * SIGNATURE_IN_PROGRESS, PARTIALLY_SIGNED, READY_FOR_SUBMISSION) dépendent de Signature/Package et
 * sont exposées par le résumé du module Package, jamais recalculées côté frontend.
 */
@Injectable()
export class GetReadinessStatusUseCase {
  constructor(
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetReadinessStatusQuery): Promise<ReadinessStatusResult> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const activeApproval = await this.finalApprovalRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (activeApproval) {
      return { status: ReadinessStatus.Approved, activeApprovalId: activeApproval.id };
    }

    const latest = (await this.validationRunRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, limit: 1, offset: 0 })).items[0];
    if (!latest) {
      return { status: ReadinessStatus.NotReady };
    }

    return { status: latest.readinessStatus, latestValidationRunId: latest.id };
  }
}
