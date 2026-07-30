import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import type { TenderStatus } from "../../domain/tender-status";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_SEARCH_PROVIDER, type TenderSearchProvider } from "../ports/tender-search-provider";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListTendersQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  cursor?: string | undefined;
  limit: number;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  clientAccountId?: string | undefined;
  search?: string | undefined;
  deadlineAfter?: string | undefined;
  deadlineBefore?: string | undefined;
  overdue?: boolean | undefined;
  sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListTendersResult = Readonly<{ items: TenderSummary[]; nextCursor: string | null }>;

@Injectable()
export class ListTendersUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_SEARCH_PROVIDER) private readonly searchProvider: TenderSearchProvider,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListTendersQuery): Promise<ListTendersResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    // Mission Sprint 5.1 §"filtrer les appels d'offres par client" — un utilisateur standard ne
    // voit que les tenders des clients auxquels il est affecté (OWNER/ADMIN voient tout), jamais un
    // filtrage en mémoire après chargement complet.
    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const idsFilter = query.search
      ? await this.searchProvider.findMatchingTenderIds({ organizationId: query.organizationId, query: query.search })
      : undefined;

    const page = await this.tenderRepository.list({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      internalOwnerId: query.internalOwnerId,
      clientAccountId: query.clientAccountId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      idsFilter,
      deadlineAfter: query.deadlineAfter ? new Date(query.deadlineAfter) : undefined,
      deadlineBefore: query.deadlineBefore ? new Date(query.deadlineBefore) : undefined,
      overdue: query.overdue,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    return { items: page.items.map(toTenderSummary), nextCursor: page.nextCursor };
  }
}
