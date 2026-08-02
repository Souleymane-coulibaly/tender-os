import type { DeliverableExportSelection } from "../../domain/deliverable-export-selection.entity";

export interface DeliverableExportSelectionRepository {
  /** Upsert par `(deliverableSectionId, organizationId)` — une section n'a jamais qu'une seule
   *  sélection active pour l'export à la fois (mission §11, remplace la précédente). */
  upsert(selection: DeliverableExportSelection): Promise<void>;
  findBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<DeliverableExportSelection | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableExportSelection[]>;
}

export const DELIVERABLE_EXPORT_SELECTION_REPOSITORY = Symbol("DELIVERABLE_EXPORT_SELECTION_REPOSITORY");
