import { Inject, Injectable } from "@nestjs/common";
import { TenderLotNotFoundError, TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type GetTenderLotQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorRole: string;
}>;

@Injectable()
export class GetTenderLotUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
  ) {}

  async execute(query: GetTenderLotQuery): Promise<TenderLotSummary> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.tenderRepository.findById({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!tender) {
      throw new TenderNotFoundError();
    }

    const lot = await this.lotRepository.findById({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      lotId: query.lotId,
    });
    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    return toTenderLotSummary(lot);
  }
}
