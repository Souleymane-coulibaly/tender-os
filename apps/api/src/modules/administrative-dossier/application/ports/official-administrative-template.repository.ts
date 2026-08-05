import type { AdministrativeFormType } from "../../domain/administrative-form-type";
import type { OfficialAdministrativeTemplate } from "../../domain/official-administrative-template.aggregate";

export interface OfficialAdministrativeTemplateRepository {
  create(template: OfficialAdministrativeTemplate): Promise<void>;
  findById(input: { id: string }): Promise<OfficialAdministrativeTemplate | null>;
  /** Le gabarit ACTIVE propre à cette organisation, s'il existe (hors périmètre Étape 1 : aucun
   *  gabarit org-spécifique n'est créé cette passe, mais le mécanisme de résolution le prévoit). */
  findActiveForOrganization(input: { organizationId: string; documentType: AdministrativeFormType }): Promise<OfficialAdministrativeTemplate | null>;
  /** Le gabarit ACTIVE système (organizationId NULL) — le repli par défaut. */
  findActiveSystemWide(input: { documentType: AdministrativeFormType }): Promise<OfficialAdministrativeTemplate | null>;
  save(template: OfficialAdministrativeTemplate): Promise<void>;
}

export const OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY = Symbol("OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY");
