/** Mission §14 — catalogue fermé, jamais le seul nom de fichier pour comprendre le dossier. */
export const PackageItemCategory = {
  Administrative: "ADMINISTRATIVE",
  Technical: "TECHNICAL",
  Financial: "FINANCIAL",
  Legal: "LEGAL",
  Certificate: "CERTIFICATE",
  Annex: "ANNEX",
  Other: "OTHER",
} as const;
export type PackageItemCategory = (typeof PackageItemCategory)[keyof typeof PackageItemCategory];

/** Mission §41 — dénormalisé depuis la `ResponsePackageVersion` courante, jamais la seule source
 *  de vérité. */
export const ResponsePackageStatus = {
  Draft: "DRAFT",
  InReview: "IN_REVIEW",
  Ready: "READY",
  Validated: "VALIDATED",
  Exported: "EXPORTED",
  Invalidated: "INVALIDATED",
} as const;
export type ResponsePackageStatus = (typeof ResponsePackageStatus)[keyof typeof ResponsePackageStatus];

/** Mission §50 — VALIDATED est un état terminal et immuable pour cette version précise. */
export const ResponsePackageVersionStatus = {
  Draft: "DRAFT",
  InReview: "IN_REVIEW",
  Validated: "VALIDATED",
} as const;
export type ResponsePackageVersionStatus = (typeof ResponsePackageVersionStatus)[keyof typeof ResponsePackageVersionStatus];

/** Mission §15 — sources des livrables déjà produits ailleurs, jamais un second moteur. */
export const PackageItemSourceType = {
  ChecklistItem: "CHECKLIST_ITEM",
  AdministrativeDocument: "ADMINISTRATIVE_DOCUMENT",
  TechnicalMemo: "TECHNICAL_MEMO",
  PricingScheduleFinalFile: "PRICING_SCHEDULE_FINAL_FILE",
  UploadedDocument: "UPLOADED_DOCUMENT",
  Manual: "MANUAL",
} as const;
export type PackageItemSourceType = (typeof PackageItemSourceType)[keyof typeof PackageItemSourceType];

/** Mission §13 — jamais un simple booléen, un document conditionnel ne peut pas être représenté
 *  correctement par un booléen `required` seul. */
export const PackageItemRequirementType = {
  Required: "REQUIRED",
  Optional: "OPTIONAL",
  Conditional: "CONDITIONAL",
} as const;
export type PackageItemRequirementType = (typeof PackageItemRequirementType)[keyof typeof PackageItemRequirementType];

/** Mission §3/§28 — axe SÉPARÉ du type d'obligation. Une condition inconnue devient NEEDS_REVIEW,
 *  jamais un blocage automatique sur une déduction incertaine. */
export const PackageItemApplicabilityStatus = {
  Applicable: "APPLICABLE",
  NotApplicable: "NOT_APPLICABLE",
  NeedsReview: "NEEDS_REVIEW",
} as const;
export type PackageItemApplicabilityStatus = (typeof PackageItemApplicabilityStatus)[keyof typeof PackageItemApplicabilityStatus];

/** Mission §26/§27 — dérivé, jamais assigné directement par un appelant : voir
 *  `derivePackageItemStatus`. */
export const PackageItemStatus = {
  Ready: "READY",
  MissingBlocking: "MISSING_BLOCKING",
  MissingNonBlocking: "MISSING_NON_BLOCKING",
  NotApplicable: "NOT_APPLICABLE",
  NeedsReview: "NEEDS_REVIEW",
} as const;
export type PackageItemStatus = (typeof PackageItemStatus)[keyof typeof PackageItemStatus];
