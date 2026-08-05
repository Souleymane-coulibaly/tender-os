/**
 * Sprint 8C.1 — provenance d'une valeur affichée dans un formulaire officiel (mission §9,
 * traçabilité de la provenance). `UserInput` marque une valeur venant d'un `AdministrativeFormDraft`
 * (surcharge locale) — jamais silencieusement propagée vers la fiche Organisation/Client maîtresse.
 */
export const FormFieldSource = {
  OrganizationProfile: "ORGANIZATION_PROFILE",
  ClientProfile: "CLIENT_PROFILE",
  Tender: "TENDER",
  Lot: "LOT",
  GroupMember: "GROUP_MEMBER",
  Subcontractor: "SUBCONTRACTOR",
  PricingVersion: "PRICING_VERSION",
  AdministrativeDossier: "ADMINISTRATIVE_DOSSIER",
  UserInput: "USER_INPUT",
  BuyerTemplate: "BUYER_TEMPLATE",
  ImportedDocument: "IMPORTED_DOCUMENT",
} as const;

export type FormFieldSource = (typeof FormFieldSource)[keyof typeof FormFieldSource];
