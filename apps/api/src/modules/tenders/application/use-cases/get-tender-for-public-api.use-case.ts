import { Inject, Injectable } from "@nestjs/common";
import { TenderNotFoundError } from "../../domain/errors";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";

export type GetTenderForPublicApiQuery = Readonly<{ organizationId: string; tenderId: string; restrictToClientAccountIds?: readonly string[] | undefined }>;

/** V2 Sprint 16 — mission §101/§102 anti-énumération : un Tender hors du périmètre du principal
 *  technique (autre organisation OU, si la clé est restreinte, autre client) échoue avec la MÊME
 *  erreur qu'un Tender inexistant, jamais un 403 qui confirmerait son existence. */
@Injectable()
export class GetTenderForPublicApiUseCase {
  constructor(@Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository) {}

  async execute(query: GetTenderForPublicApiQuery): Promise<TenderSummary> {
    const tender = await this.tenderRepository.findById({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!tender) {
      throw new TenderNotFoundError();
    }
    if (query.restrictToClientAccountIds && !query.restrictToClientAccountIds.includes(tender.clientAccountId)) {
      throw new TenderNotFoundError();
    }
    return toTenderSummary(tender);
  }
}
