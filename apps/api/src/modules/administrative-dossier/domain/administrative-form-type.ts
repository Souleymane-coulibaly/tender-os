import { AdministrativeDocumentType } from "./administrative-document-type";

/**
 * Sprint 8C.1 — sous-ensemble FERMÉ de `AdministrativeDocumentType` correspondant aux formulaires
 * officiels remplissables (DC1, DC2, DC4, ATTRI1 — affiché "ATTRI1 — Acte d'engagement, ancien
 * formulaire DC3" mais le code interne reste `ACTE_ENGAGEMENT`, catalogue déjà existant, jamais
 * un second catalogue parallèle).
 */
export const AdministrativeFormType = {
  Dc1: AdministrativeDocumentType.Dc1,
  Dc2: AdministrativeDocumentType.Dc2,
  Dc4: AdministrativeDocumentType.Dc4,
  Attri1: AdministrativeDocumentType.ActeEngagement,
} as const;

export type AdministrativeFormType = (typeof AdministrativeFormType)[keyof typeof AdministrativeFormType];

const ADMINISTRATIVE_FORM_TYPE_VALUES: readonly string[] = Object.values(AdministrativeFormType);

export function isAdministrativeFormType(value: string): value is AdministrativeFormType {
  return ADMINISTRATIVE_FORM_TYPE_VALUES.includes(value);
}
