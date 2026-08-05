import type { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";

export interface AdministrativeDossierRepository {
  create(dossier: AdministrativeDossier): Promise<void>;
  findById(input: { organizationId: string; dossierId: string }): Promise<AdministrativeDossier | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<AdministrativeDossier | null>;
  save(dossier: AdministrativeDossier): Promise<void>;
}

export const ADMINISTRATIVE_DOSSIER_REPOSITORY = Symbol("ADMINISTRATIVE_DOSSIER_REPOSITORY");
