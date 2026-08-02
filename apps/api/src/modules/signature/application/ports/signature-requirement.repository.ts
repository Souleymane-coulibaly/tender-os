import type { SignatureRequirement } from "../../domain/signature-requirement";

export interface SignatureRequirementRepository {
  create(requirement: SignatureRequirement): Promise<void>;
  findById(input: { organizationId: string; requirementId: string }): Promise<SignatureRequirement | null>;
  listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SignatureRequirement[]>;
  save(requirement: SignatureRequirement): Promise<void>;
}

export const SIGNATURE_REQUIREMENT_REPOSITORY = Symbol("SIGNATURE_REQUIREMENT_REPOSITORY");
