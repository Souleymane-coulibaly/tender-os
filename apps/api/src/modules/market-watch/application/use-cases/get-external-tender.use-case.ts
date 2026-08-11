import { Inject, Injectable } from "@nestjs/common";
import { ExternalTenderNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { ExternalTender } from "../../domain/external-tender.entity";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../ports/external-tender.repository";

export type GetExternalTenderQuery = Readonly<{ organizationId: string; actorRole: string; externalTenderId: string }>;

/** Mission §93 — détail d'un marché (jamais lié à un SavedSearch précis : accessible à tout
 *  membre autorisé de l'organisation, même motif que consulter un Tender). */
@Injectable()
export class GetExternalTenderUseCase {
  constructor(@Inject(EXTERNAL_TENDER_REPOSITORY) private readonly repository: ExternalTenderRepository) {}

  async execute(query: GetExternalTenderQuery): Promise<ExternalTender> {
    assertHasMarketWatchPermission(query.actorRole, MarketWatchPermission.Read);

    const tender = await this.repository.findById({ organizationId: query.organizationId, externalTenderId: query.externalTenderId });
    if (!tender) {
      throw new ExternalTenderNotFoundError();
    }
    return tender;
  }
}
