import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import type { OpportunityStatus } from "../../domain/opportunity-status";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";

export type ListOpportunitiesQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  cursor?: string | undefined;
  limit: number;
  status?: OpportunityStatus | undefined;
  clientAccountId?: string | undefined;
  sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListOpportunitiesResult = Readonly<{ items: OpportunitySummary[]; nextCursor: string | null }>;

@Injectable()
export class ListOpportunitiesUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListOpportunitiesQuery): Promise<ListOpportunitiesResult> {
    assertHasOpportunityPermission(query.actorRole, OpportunityPermission.List);

    // Même motif que ListTendersUseCase — un utilisateur standard ne voit que les clients
    // auxquels il est affecté (OWNER/ADMIN voient tout). Une Opportunity sans clientAccountId
    // reste visible tant que l'acteur a AU MOINS un client accessible (voir OpportunityRepository.
    // list, qui ne filtre jamais les Opportunities sans candidat par cette restriction).
    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const page = await this.repository.list({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      clientAccountId: query.clientAccountId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    return { items: page.items.map(toOpportunitySummary), nextCursor: page.nextCursor };
  }
}
