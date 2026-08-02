import type { DeliverableSection } from "../../domain/deliverable-section.aggregate";

export interface DeliverableSectionRepository {
  createMany(sections: readonly DeliverableSection[]): Promise<void>;
  findById(input: { organizationId: string; sectionId: string }): Promise<DeliverableSection | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableSection[]>;
  save(section: DeliverableSection): Promise<void>;
}

export const DELIVERABLE_SECTION_REPOSITORY = Symbol("DELIVERABLE_SECTION_REPOSITORY");
