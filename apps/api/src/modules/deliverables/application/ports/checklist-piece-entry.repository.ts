import type { ChecklistPieceEntry } from "../../domain/checklist-piece-entry.aggregate";

export interface ChecklistPieceEntryRepository {
  create(entry: ChecklistPieceEntry): Promise<void>;
  findById(input: { organizationId: string; entryId: string }): Promise<ChecklistPieceEntry | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly ChecklistPieceEntry[]>;
  save(entry: ChecklistPieceEntry): Promise<void>;
}

export const CHECKLIST_PIECE_ENTRY_REPOSITORY = Symbol("CHECKLIST_PIECE_ENTRY_REPOSITORY");
