import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListTenderLotsQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListTenderLotsUseCase {
  constructor(@Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository) {}

  async execute(query: ListTenderLotsQuery): Promise<TenderLotSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const lots = await this.lotRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return lots.map(toTenderLotSummary);
  }
}
