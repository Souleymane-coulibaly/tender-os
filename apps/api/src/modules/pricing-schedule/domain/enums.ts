/** Mission §5 — catalogue fermé, jamais une chaîne libre côté API. */
export const FinancialDocumentType = {
  Bpu: "BPU",
  Dpgf: "DPGF",
  Dqe: "DQE",
  OtherFinancialSchedule: "OTHER_FINANCIAL_SCHEDULE",
} as const;
export type FinancialDocumentType = (typeof FinancialDocumentType)[keyof typeof FinancialDocumentType];

/** Mission §43 — dénormalisé depuis la `PricingScheduleVersion` courante, jamais la seule source de
 *  vérité (voir `PricingScheduleVersionStatus`). */
export const PricingScheduleStatus = {
  Draft: "DRAFT",
  Ready: "READY",
  Validated: "VALIDATED",
  Exported: "EXPORTED",
} as const;
export type PricingScheduleStatus = (typeof PricingScheduleStatus)[keyof typeof PricingScheduleStatus];

/** Mission §45 — VALIDATED est un état terminal et immuable pour cette version précise. */
export const PricingScheduleVersionStatus = {
  Draft: "DRAFT",
  InReview: "IN_REVIEW",
  Validated: "VALIDATED",
} as const;
export type PricingScheduleVersionStatus = (typeof PricingScheduleVersionStatus)[keyof typeof PricingScheduleVersionStatus];

/** Mission §18 — seul PRICE_ITEM porte un prix ; les autres ne sont jamais traités comme une ligne
 *  tarifaire (titre de section, sous-total, note libre, séparateur). */
export const PricingScheduleLineKind = {
  PriceItem: "PRICE_ITEM",
  SectionHeader: "SECTION_HEADER",
  Subtotal: "SUBTOTAL",
  Note: "NOTE",
} as const;
export type PricingScheduleLineKind = (typeof PricingScheduleLineKind)[keyof typeof PricingScheduleLineKind];

export const PricingScheduleLineStatus = {
  Empty: "EMPTY",
  Priced: "PRICED",
  NeedsReview: "NEEDS_REVIEW",
} as const;
export type PricingScheduleLineStatus = (typeof PricingScheduleLineStatus)[keyof typeof PricingScheduleLineStatus];

/** Mission §58-§60. */
export const ControlSeverity = {
  Error: "ERROR",
  Warning: "WARNING",
  Info: "INFO",
} as const;
export type ControlSeverity = (typeof ControlSeverity)[keyof typeof ControlSeverity];

/** Catalogue fermé des contrôles (mission §58-§60) — un "prix inhabituel" reste un WARNING
 *  explicable, jamais une correction automatique ni une affirmation "ce prix est faux". */
export const ControlCode = {
  EmptyMandatoryCell: "EMPTY_MANDATORY_CELL",
  MissingUnitPrice: "MISSING_UNIT_PRICE",
  IncoherentTotal: "INCOHERENT_TOTAL",
  BrokenFormula: "BROKEN_FORMULA",
  ModifiedSourceQuantity: "MODIFIED_SOURCE_QUANTITY",
  IncoherentUnit: "INCOHERENT_UNIT",
  DuplicateLine: "DUPLICATE_LINE",
  AberrantRelativePrice: "ABERRANT_RELATIVE_PRICE",
  BpuDqeIncoherence: "BPU_DQE_INCOHERENCE",
  UnmappedLine: "UNMAPPED_LINE",
  ModifiedProtectedCell: "MODIFIED_PROTECTED_CELL",
} as const;
export type ControlCode = (typeof ControlCode)[keyof typeof ControlCode];
