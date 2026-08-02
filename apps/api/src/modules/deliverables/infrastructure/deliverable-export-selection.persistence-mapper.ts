import { DeliverableExportSelection } from "../domain/deliverable-export-selection.entity";

export type PersistedDeliverableExportSelection = {
  id: string;
  organizationId: string;
  deliverableSectionId: string;
  deliverableRevisionId: string;
  selectedBy: string;
  selectedAt: Date;
  justification: string | null;
};

export function toDomainExportSelection(record: PersistedDeliverableExportSelection): DeliverableExportSelection {
  return DeliverableExportSelection.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableSectionId: record.deliverableSectionId,
    deliverableRevisionId: record.deliverableRevisionId,
    selectedBy: record.selectedBy,
    selectedAt: record.selectedAt,
    justification: record.justification ?? undefined,
  });
}

export function toExportSelectionRow(selection: DeliverableExportSelection) {
  return {
    id: selection.id,
    organizationId: selection.organizationId,
    deliverableSectionId: selection.deliverableSectionId,
    deliverableRevisionId: selection.deliverableRevisionId,
    selectedBy: selection.selectedBy,
    selectedAt: selection.selectedAt,
    justification: selection.justification ?? null,
  };
}
