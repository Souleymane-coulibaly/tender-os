import type { ChecklistItem } from "../../domain/checklist-item.entity";

export interface ChecklistItemRepository {
  findById(input: { organizationId: string; tenderId: string; itemId: string }): Promise<ChecklistItem | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<ChecklistItem[]>;
  save(item: ChecklistItem): Promise<void>;
}

export const CHECKLIST_ITEM_REPOSITORY = Symbol("CHECKLIST_ITEM_REPOSITORY");
