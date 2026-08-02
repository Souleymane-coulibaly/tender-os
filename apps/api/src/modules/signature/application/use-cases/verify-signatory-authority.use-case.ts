import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SignatoryNotFoundError } from "../../domain/errors";
import { toSignatorySummary, type SignatorySummary } from "../dtos";
import { SIGNATORY_REPOSITORY, type SignatoryRepository } from "../ports/signatory.repository";

export type VerifySignatoryAuthorityCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  signatoryId: string;
  approved: boolean;
}>;

/**
 * Mission Sprint 8A §42 — vérification humaine explicite du pouvoir de signature. "OWNER ou ADMIN
 * TenderOS ≠ pouvoir juridique automatique" : cette action est le SEUL moyen de rendre un
 * signataire utilisable dans une transaction, jamais une conséquence automatique de son rôle
 * applicatif.
 */
@Injectable()
export class VerifySignatoryAuthorityUseCase {
  constructor(
    @Inject(SIGNATORY_REPOSITORY) private readonly signatoryRepository: SignatoryRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: VerifySignatoryAuthorityCommand): Promise<SignatorySummary> {
    const signatory = await this.signatoryRepository.findById({ organizationId: command.organizationId, signatoryId: command.signatoryId });
    if (!signatory) {
      throw new SignatoryNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: signatory.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const occurredAt = this.clock.now();
    if (command.approved) {
      signatory.verify({ verifiedBy: command.actorId, occurredAt });
    } else {
      signatory.reject({ verifiedBy: command.actorId, occurredAt });
    }
    await this.signatoryRepository.save(signatory);
    return toSignatorySummary(signatory);
  }
}
