import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toSignatorySummary, type SignatorySummary } from "../dtos";
import { SIGNATORY_REPOSITORY, type SignatoryRepository } from "../ports/signatory.repository";

export type ListSignatoriesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSignatoriesUseCase {
  constructor(
    @Inject(SIGNATORY_REPOSITORY) private readonly signatoryRepository: SignatoryRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListSignatoriesQuery): Promise<readonly SignatorySummary[]> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });
    const signatories = await this.signatoryRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return signatories.map(toSignatorySummary);
  }
}
