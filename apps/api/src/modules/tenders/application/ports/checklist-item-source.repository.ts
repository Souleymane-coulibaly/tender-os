/** V2 Sprint 6 §11 — provenance(s) d'un ChecklistItem, jamais fusionnées/supprimées. */
export type ChecklistItemSourceRecord = Readonly<{
  id: string;
  organizationId: string;
  checklistItemId: string;
  findingType?: string | undefined;
  findingId?: string | undefined;
  sourceSuggestionId?: string | undefined;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  analysisVersion?: number | undefined;
  pageStart?: number | undefined;
  citation?: string | undefined;
  sectionTitle?: string | undefined;
  confidence?: number | undefined;
  createdAt: Date;
}>;

export type CreateChecklistItemSourceInput = Readonly<{
  id: string;
  organizationId: string;
  checklistItemId: string;
  findingType?: string | undefined;
  findingId?: string | undefined;
  sourceSuggestionId?: string | undefined;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  analysisVersion?: number | undefined;
  pageStart?: number | undefined;
  citation?: string | undefined;
  sectionTitle?: string | undefined;
  confidence?: number | undefined;
  createdAt: Date;
}>;

export interface ChecklistItemSourceRepository {
  create(input: CreateChecklistItemSourceInput): Promise<ChecklistItemSourceRecord>;
  listByChecklistItem(input: { organizationId: string; checklistItemId: string }): Promise<ChecklistItemSourceRecord[]>;
}

export const CHECKLIST_ITEM_SOURCE_REPOSITORY = Symbol("CHECKLIST_ITEM_SOURCE_REPOSITORY");
