import type { DumeDeclaration } from "../../domain/dume-declaration.aggregate";
import type { DumeDeclarationVersion } from "../../domain/dume-declaration-version.entity";

export interface DumeDeclarationRepository {
  create(declaration: DumeDeclaration): Promise<void>;
  findById(input: { organizationId: string; dumeDeclarationId: string }): Promise<DumeDeclaration | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<DumeDeclaration | null>;
  save(declaration: DumeDeclaration): Promise<void>;
}

export const DUME_DECLARATION_REPOSITORY = Symbol("DUME_DECLARATION_REPOSITORY");

export interface DumeDeclarationVersionRepository {
  create(version: DumeDeclarationVersion): Promise<void>;
  findById(input: { organizationId: string; versionId: string }): Promise<DumeDeclarationVersion | null>;
  listByDeclaration(input: { organizationId: string; dumeDeclarationId: string }): Promise<readonly DumeDeclarationVersion[]>;
}

export const DUME_DECLARATION_VERSION_REPOSITORY = Symbol("DUME_DECLARATION_VERSION_REPOSITORY");
