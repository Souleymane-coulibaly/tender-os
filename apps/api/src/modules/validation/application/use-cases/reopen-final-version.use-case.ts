import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { FinalApprovalNotFoundError } from "../../domain/errors";
import { toFinalApprovalSummary, type FinalApprovalSummary } from "../dtos";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../ports/final-approval.repository";

export type ReopenFinalVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  reason: string;
}>;

/** Mission Sprint 8A §32 — invalide l'approbation ACTIVE d'un Tender (ex. après une modification
 *  de contenu) : relance la validation, exige une nouvelle approbation avant tout nouveau
 *  figeage FINAL. L'ancienne approbation reste dans l'historique, jamais supprimée. */
@Injectable()
export class ReopenFinalVersionUseCase {
  constructor(
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ReopenFinalVersionCommand): Promise<FinalApprovalSummary> {
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const approval = await this.finalApprovalRepository.findActiveForTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!approval) {
      throw new FinalApprovalNotFoundError();
    }

    approval.invalidate({ reason: command.reason, occurredAt: this.clock.now() });
    await this.finalApprovalRepository.save(approval);

    return toFinalApprovalSummary(approval);
  }
}
