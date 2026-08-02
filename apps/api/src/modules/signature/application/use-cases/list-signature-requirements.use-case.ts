import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toSignatureRequirementSummary, type SignatureRequirementSummary } from "../dtos";
import { SIGNATURE_REQUIREMENT_REPOSITORY, type SignatureRequirementRepository } from "../ports/signature-requirement.repository";

export type ListSignatureRequirementsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSignatureRequirementsUseCase {
  constructor(
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListSignatureRequirementsQuery): Promise<readonly SignatureRequirementSummary[]> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const requirements = await this.signatureRequirementRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return requirements.map(toSignatureRequirementSummary);
  }
}
