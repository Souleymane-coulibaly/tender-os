import { Inject, Injectable } from "@nestjs/common";
import type { TenderStatus } from "../../domain/tender-status";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";

export type ListTendersForPublicApiQuery = Readonly<{
  organizationId: string;
  /** `undefined` = pas de restriction (mission §18 "liste vide = aucune restriction
   *  supplémentaire"), résolu par l'appelant (ApiKeyGuard/contrôleur Public API) à partir du
   *  principal technique — jamais un `actorId`/`ListAccessibleClientsUseCase` (inapplicable à une
   *  ApiKey, qui n'est pas une Membership). */
  restrictToClientAccountIds?: readonly string[] | undefined;
  status?: TenderStatus | undefined;
  clientAccountId?: string | undefined;
  updatedSince?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}>;

export type ListTendersForPublicApiResult = Readonly<{ items: TenderSummary[]; nextCursor: string | null }>;

/**
 * V2 Sprint 16 (Integration Hub) — lecture seule pour `integrations` (Public API `GET
 * /api/v1/public/tenders`, mission §8/§66/§67/§68/§69). Même repository que `ListTendersUseCase`,
 * jamais un accès Prisma direct (mission §9) — seule la source du périmètre ClientAccess diffère
 * (principal technique, pas un utilisateur humain).
 */
@Injectable()
export class ListTendersForPublicApiUseCase {
  constructor(@Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository) {}

  async execute(query: ListTendersForPublicApiQuery): Promise<ListTendersForPublicApiResult> {
    if (query.restrictToClientAccountIds && query.restrictToClientAccountIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const page = await this.tenderRepository.list({
      organizationId: query.organizationId,
      restrictToClientAccountIds: query.restrictToClientAccountIds,
      status: query.status,
      clientAccountId: query.clientAccountId,
      updatedSince: query.updatedSince ? new Date(query.updatedSince) : undefined,
      cursor: query.cursor,
      limit: query.limit,
      sort: "updatedAt",
      sortDirection: "desc",
    });

    return { items: page.items.map(toTenderSummary), nextCursor: page.nextCursor };
  }
}
