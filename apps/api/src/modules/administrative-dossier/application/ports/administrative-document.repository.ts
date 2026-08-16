import type { AdministrativeDocument } from "../../domain/administrative-document.aggregate";

export interface AdministrativeDocumentRepository {
  create(document: AdministrativeDocument): Promise<void>;
  findById(input: { organizationId: string; documentId: string }): Promise<AdministrativeDocument | null>;
  listByDossier(input: { organizationId: string; administrativeDossierId: string }): Promise<readonly AdministrativeDocument[]>;
  findByRequirementId(input: { organizationId: string; requirementId: string }): Promise<AdministrativeDocument | null>;
  save(document: AdministrativeDocument): Promise<void>;
  /** V2 Sprint 25 (Dashboard Premium — checklist d'activation) — mission §25.69 "Ajouter les
   *  documents administratifs" : existence org-wide, jamais un comptage/liste complète (une seule
   *  ligne suffit à répondre à la question posée par la checklist). */
  existsForOrganization(organizationId: string): Promise<boolean>;
}

export const ADMINISTRATIVE_DOCUMENT_REPOSITORY = Symbol("ADMINISTRATIVE_DOCUMENT_REPOSITORY");
