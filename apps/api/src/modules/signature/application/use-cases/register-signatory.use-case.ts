import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { Signatory } from "../../domain/signatory";
import { toSignatorySummary, type SignatorySummary } from "../dtos";
import { SIGNATORY_REPOSITORY, type SignatoryRepository } from "../ports/signatory.repository";

export type RegisterSignatoryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  userId?: string | undefined;
  firstName: string;
  lastName: string;
  professionalEmail: string;
  jobTitle?: string | undefined;
  organizationName?: string | undefined;
  authorityText?: string | undefined;
  authorityDocumentId?: string | undefined;
  validFrom?: Date | undefined;
  validUntil?: Date | undefined;
}>;

/** Mission Sprint 8A §37/§42/§56 — "Affecter un signataire : Non ou règle stricte" ⇒
 *  `ClientPermission.ApproveExport`. */
@Injectable()
export class RegisterSignatoryUseCase {
  constructor(
    @Inject(SIGNATORY_REPOSITORY) private readonly signatoryRepository: SignatoryRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RegisterSignatoryCommand): Promise<SignatorySummary> {
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const signatory = Signatory.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      userId: command.userId,
      firstName: command.firstName,
      lastName: command.lastName,
      professionalEmail: command.professionalEmail,
      jobTitle: command.jobTitle,
      organizationName: command.organizationName,
      authorityText: command.authorityText,
      authorityDocumentId: command.authorityDocumentId,
      validFrom: command.validFrom,
      validUntil: command.validUntil,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.signatoryRepository.create(signatory);
    return toSignatorySummary(signatory);
  }
}
