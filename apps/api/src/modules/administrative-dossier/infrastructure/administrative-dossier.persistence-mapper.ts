import { AdministrativeDossier } from "../domain/administrative-dossier.aggregate";
import type { AdministrativeDossierStatus, AdministrativeDossierValidationStatus } from "../domain/administrative-dossier-status";

export type PersistedAdministrativeDossier = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  status: string;
  completionPercentage: number;
  validationStatus: string;
  lastValidatedBy: string | null;
  lastValidatedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainAdministrativeDossier(record: PersistedAdministrativeDossier): AdministrativeDossier {
  return AdministrativeDossier.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    status: record.status as AdministrativeDossierStatus,
    completionPercentage: record.completionPercentage,
    validationStatus: record.validationStatus as AdministrativeDossierValidationStatus,
    lastValidatedBy: record.lastValidatedBy ?? undefined,
    lastValidatedAt: record.lastValidatedAt ?? undefined,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toAdministrativeDossierRow(dossier: AdministrativeDossier) {
  return {
    id: dossier.id,
    organizationId: dossier.organizationId,
    clientAccountId: dossier.clientAccountId,
    tenderId: dossier.tenderId,
    status: dossier.status,
    completionPercentage: dossier.completionPercentage,
    validationStatus: dossier.validationStatus,
    lastValidatedBy: dossier.lastValidatedBy ?? null,
    lastValidatedAt: dossier.lastValidatedAt ?? null,
    version: dossier.version,
    createdAt: dossier.createdAt,
    updatedAt: dossier.updatedAt,
  };
}
