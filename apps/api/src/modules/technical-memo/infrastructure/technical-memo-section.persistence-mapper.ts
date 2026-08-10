import type { TechnicalMemoSectionCategory, TechnicalMemoSectionStatus } from "../domain/enums";
import { TechnicalMemoSection } from "../domain/technical-memo-section.entity";

type TechnicalMemoSectionRow = {
  id: string;
  organizationId: string;
  technicalMemoId: string;
  parentSectionId: string | null;
  sectionKey: string;
  title: string;
  order: number;
  level: number;
  category: string;
  categoryConfirmedByUser: boolean;
  instructionText: string | null;
  isTable: boolean;
  wordLimit: number | null;
  pageLimit: number | null;
  status: string;
  content: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainTechnicalMemoSection(record: TechnicalMemoSectionRow): TechnicalMemoSection {
  return TechnicalMemoSection.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    technicalMemoId: record.technicalMemoId,
    parentSectionId: record.parentSectionId ?? undefined,
    sectionKey: record.sectionKey,
    title: record.title,
    order: record.order,
    level: record.level,
    category: record.category as TechnicalMemoSectionCategory,
    categoryConfirmedByUser: record.categoryConfirmedByUser,
    instructionText: record.instructionText ?? undefined,
    isTable: record.isTable,
    wordLimit: record.wordLimit ?? undefined,
    pageLimit: record.pageLimit ?? undefined,
    status: record.status as TechnicalMemoSectionStatus,
    content: record.content ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toTechnicalMemoSectionRow(section: TechnicalMemoSection) {
  return {
    id: section.id,
    organizationId: section.organizationId,
    technicalMemoId: section.technicalMemoId,
    parentSectionId: section.parentSectionId ?? null,
    sectionKey: section.sectionKey,
    title: section.title,
    order: section.order,
    level: section.level,
    category: section.category,
    categoryConfirmedByUser: section.categoryConfirmedByUser,
    instructionText: section.instructionText ?? null,
    isTable: section.isTable,
    wordLimit: section.wordLimit ?? null,
    pageLimit: section.pageLimit ?? null,
    status: section.status,
    content: section.content ?? null,
    createdBy: section.createdBy,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}
