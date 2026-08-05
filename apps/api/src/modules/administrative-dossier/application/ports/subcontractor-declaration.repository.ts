import type { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";

export interface SubcontractorDeclarationRepository {
  create(declaration: SubcontractorDeclaration): Promise<void>;
  findById(input: { organizationId: string; subcontractorDeclarationId: string }): Promise<SubcontractorDeclaration | null>;
  listByTenderId(input: { organizationId: string; tenderId: string }): Promise<readonly SubcontractorDeclaration[]>;
  save(declaration: SubcontractorDeclaration): Promise<void>;
}

export const SUBCONTRACTOR_DECLARATION_REPOSITORY = Symbol("SUBCONTRACTOR_DECLARATION_REPOSITORY");
