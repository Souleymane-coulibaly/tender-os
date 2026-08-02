import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SignatureRequirementNotFoundError } from "../../domain/errors";
import { toSignatureRequirementSummary, type SignatureRequirementSummary } from "../dtos";
import { SIGNATURE_REQUIREMENT_REPOSITORY, type SignatureRequirementRepository } from "../ports/signature-requirement.repository";

export type ConfirmSignatureRequirementCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  requirementId: string;
  comment?: string | undefined;
}>;

@Injectable()
export class ConfirmSignatureRequirementUseCase {
  constructor(
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ConfirmSignatureRequirementCommand): Promise<SignatureRequirementSummary> {
    const requirement = await this.signatureRequirementRepository.findById({ organizationId: command.organizationId, requirementId: command.requirementId });
    if (!requirement) {
      throw new SignatureRequirementNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: requirement.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    requirement.confirm({ confirmedBy: command.actorId, comment: command.comment, occurredAt: this.clock.now() });
    await this.signatureRequirementRepository.save(requirement);
    return toSignatureRequirementSummary(requirement);
  }
}
