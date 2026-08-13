import { Inject, Injectable } from "@nestjs/common";
import { PASS_PURCHASE_REPOSITORY, type PassPurchasePage, type PassPurchaseRepository } from "../ports/pass-purchase.repository";

export type ListPassPurchasesQuery = Readonly<{ organizationId: string; cursor?: string | undefined; limit: number }>;

/** Mission §36 — historique des achats Pass. Plafond de page dur (même motif que le correctif P1
 *  Sprint 21 sur comments/tasks/tender-documents) : jamais une pagination non bornée. */
const MAX_PAGE_SIZE = 50;

@Injectable()
export class ListPassPurchasesUseCase {
  constructor(@Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository) {}

  async execute(query: ListPassPurchasesQuery): Promise<PassPurchasePage> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    return this.passPurchaseRepository.list(query.organizationId, { cursor: query.cursor, limit });
  }
}
