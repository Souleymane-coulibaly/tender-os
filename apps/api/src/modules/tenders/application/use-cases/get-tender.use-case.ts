import { Inject, Injectable } from "@nestjs/common";
import { TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type GetTenderQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;
export type GetTenderResult = TenderSummary;

@Injectable()
export class GetTenderUseCase {
  constructor(@Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository) {}

  async execute(query: GetTenderQuery): Promise<GetTenderResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.tenderRepository.findById({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    if (!tender) {
      throw new TenderNotFoundError();
    }

    return toTenderSummary(tender);
  }
}
