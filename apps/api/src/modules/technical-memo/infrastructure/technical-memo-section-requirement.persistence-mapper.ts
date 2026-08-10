import type { TechnicalMemoCoverageStatus, TechnicalMemoRequirementFindingType } from "../domain/enums";
import { TechnicalMemoSectionRequirement } from "../domain/technical-memo-section-requirement.entity";

type TechnicalMemoSectionRequirementRow = {
  id: string;
  organizationId: string;
  technicalMemoSectionId: string;
  findingType: string;
  findingId: string;
  coverageStatus: string;
  coverageReason: string | null;
  confirmedByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainTechnicalMemoSectionRequirement(record: TechnicalMemoSectionRequirementRow): TechnicalMemoSectionRequirement {
  return TechnicalMemoSectionRequirement.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    technicalMemoSectionId: record.technicalMemoSectionId,
    findingType: record.findingType as TechnicalMemoRequirementFindingType,
    findingId: record.findingId,
    coverageStatus: record.coverageStatus as TechnicalMemoCoverageStatus,
    coverageReason: record.coverageReason ?? undefined,
    confirmedByUser: record.confirmedByUser,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toTechnicalMemoSectionRequirementRow(requirement: TechnicalMemoSectionRequirement) {
  return {
    id: requirement.id,
    organizationId: requirement.organizationId,
    technicalMemoSectionId: requirement.technicalMemoSectionId,
    findingType: requirement.findingType,
    findingId: requirement.findingId,
    coverageStatus: requirement.coverageStatus,
    coverageReason: requirement.coverageReason ?? null,
    confirmedByUser: requirement.confirmedByUser,
    createdAt: requirement.createdAt,
    updatedAt: requirement.updatedAt,
  };
}
