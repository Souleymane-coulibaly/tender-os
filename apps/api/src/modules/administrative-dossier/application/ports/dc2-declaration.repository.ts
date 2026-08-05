import type { Dc2Declaration } from "../../domain/dc2-declaration.aggregate";
import type { Dc2DeclarationVersion } from "../../domain/dc2-declaration-version.entity";

export interface Dc2DeclarationRepository {
  create(declaration: Dc2Declaration): Promise<void>;
  findById(input: { organizationId: string; dc2DeclarationId: string }): Promise<Dc2Declaration | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dc2Declaration | null>;
  save(declaration: Dc2Declaration): Promise<void>;
}

export const DC2_DECLARATION_REPOSITORY = Symbol("DC2_DECLARATION_REPOSITORY");

export interface Dc2DeclarationVersionRepository {
  create(version: Dc2DeclarationVersion): Promise<void>;
  findById(input: { organizationId: string; versionId: string }): Promise<Dc2DeclarationVersion | null>;
  listByDeclaration(input: { organizationId: string; dc2DeclarationId: string }): Promise<readonly Dc2DeclarationVersion[]>;
}

export const DC2_DECLARATION_VERSION_REPOSITORY = Symbol("DC2_DECLARATION_VERSION_REPOSITORY");
