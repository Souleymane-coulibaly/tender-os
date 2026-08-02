import { DeliverableSection } from "../domain/deliverable-section.aggregate";
import type { DeliverableSectionStatus } from "../domain/deliverable-section-status";

export type PersistedDeliverableSection = {
  id: string;
  organizationId: string;
  deliverableId: string;
  code: string;
  title: string;
  order: number;
  headingLevel: number;
  mandatory: boolean;
  hidden: boolean;
  locked: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainSection(record: PersistedDeliverableSection): DeliverableSection {
  return DeliverableSection.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableId: record.deliverableId,
    code: record.code,
    title: record.title,
    order: record.order,
    headingLevel: record.headingLevel as 1 | 2 | 3,
    mandatory: record.mandatory,
    hidden: record.hidden,
    locked: record.locked,
    status: record.status as DeliverableSectionStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toSectionRow(section: DeliverableSection) {
  return {
    id: section.id,
    organizationId: section.organizationId,
    deliverableId: section.deliverableId,
    code: section.code,
    title: section.title,
    order: section.order,
    headingLevel: section.headingLevel,
    mandatory: section.mandatory,
    hidden: section.hidden,
    locked: section.locked,
    status: section.status,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}
