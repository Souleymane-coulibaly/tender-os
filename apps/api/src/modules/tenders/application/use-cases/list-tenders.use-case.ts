import { Inject, Injectable } from "@nestjs/common";
import type { TenderStatus } from "../../domain/tender-status";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListTendersQuery = Readonly<{
  organizationId: string;
  actorRole: string;
  cursor?: string | undefined;
  limit: number;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  search?: string | undefined;
  deadlineBefore?: string | undefined;
  sort?: "createdAt" | "submissionDeadline" | "title" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListTendersResult = Readonly<{ items: TenderSummary[]; nextCursor: string | null }>;

@Injectable()
export class ListTendersUseCase {
  constructor(@Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository) {}

  async execute(query: ListTendersQuery): Promise<ListTendersResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    const page = await this.tenderRepository.list({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      internalOwnerId: query.internalOwnerId,
      search: query.search,
      deadlineBefore: query.deadlineBefore ? new Date(query.deadlineBefore) : undefined,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    return { items: page.items.map(toTenderSummary), nextCursor: page.nextCursor };
  }
}
