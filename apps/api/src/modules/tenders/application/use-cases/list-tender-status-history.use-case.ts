import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import {
  TENDER_STATUS_HISTORY_REPOSITORY,
  type TenderStatusHistoryEntry,
  type TenderStatusHistoryRepository,
} from "../ports/tender-status-history.repository";

export type ListTenderStatusHistoryQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListTenderStatusHistoryUseCase {
  constructor(
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: TenderStatusHistoryRepository,
  ) {}

  async execute(query: ListTenderStatusHistoryQuery): Promise<TenderStatusHistoryEntry[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    return this.statusHistoryRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
  }
}
