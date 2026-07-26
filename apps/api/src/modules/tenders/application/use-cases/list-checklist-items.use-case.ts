import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import {
  CHECKLIST_ITEM_REPOSITORY,
  type ChecklistItemRepository,
} from "../ports/checklist-item.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListChecklistItemsQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListChecklistItemsUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
  ) {}

  async execute(query: ListChecklistItemsQuery): Promise<ChecklistItemSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const items = await this.checklistRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return items.sort((a, b) => a.displayOrder - b.displayOrder).map(toChecklistItemSummary);
  }
}
