import type { AdministrativeRequirement } from "../../domain/administrative-requirement.aggregate";

export interface AdministrativeRequirementRepository {
  create(requirement: AdministrativeRequirement): Promise<void>;
  findById(input: { organizationId: string; requirementId: string }): Promise<AdministrativeRequirement | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly AdministrativeRequirement[]>;
  listConfirmedByTender(input: { organizationId: string; tenderId: string }): Promise<readonly AdministrativeRequirement[]>;
  save(requirement: AdministrativeRequirement): Promise<void>;
}

export const ADMINISTRATIVE_REQUIREMENT_REPOSITORY = Symbol("ADMINISTRATIVE_REQUIREMENT_REPOSITORY");
