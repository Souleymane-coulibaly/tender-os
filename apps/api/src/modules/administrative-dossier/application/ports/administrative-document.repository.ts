import type { AdministrativeDocument } from "../../domain/administrative-document.aggregate";

export interface AdministrativeDocumentRepository {
  create(document: AdministrativeDocument): Promise<void>;
  findById(input: { organizationId: string; documentId: string }): Promise<AdministrativeDocument | null>;
  listByDossier(input: { organizationId: string; administrativeDossierId: string }): Promise<readonly AdministrativeDocument[]>;
  findByRequirementId(input: { organizationId: string; requirementId: string }): Promise<AdministrativeDocument | null>;
  save(document: AdministrativeDocument): Promise<void>;
}

export const ADMINISTRATIVE_DOCUMENT_REPOSITORY = Symbol("ADMINISTRATIVE_DOCUMENT_REPOSITORY");
