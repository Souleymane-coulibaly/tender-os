import type { Dc1Declaration } from "../../domain/dc1-declaration.aggregate";

export interface Dc1DeclarationRepository {
  create(declaration: Dc1Declaration): Promise<void>;
  findById(input: { organizationId: string; dc1DeclarationId: string }): Promise<Dc1Declaration | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dc1Declaration | null>;
  save(declaration: Dc1Declaration): Promise<void>;
}

export const DC1_DECLARATION_REPOSITORY = Symbol("DC1_DECLARATION_REPOSITORY");
