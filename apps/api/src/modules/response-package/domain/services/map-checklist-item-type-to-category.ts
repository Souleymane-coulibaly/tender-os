import { PackageItemCategory } from "../enums";

/** Sous-ensemble des valeurs `ChecklistItemType` (Sprint 6, `tenders` module) réellement utile
 *  ici — jamais une réimportation du type complet à travers la frontière du module. */
export type ChecklistItemTypeInput =
  | "ADMINISTRATIVE_DOCUMENT"
  | "TECHNICAL_DOCUMENT"
  | "FINANCIAL_DOCUMENT"
  | "CERTIFICATION"
  | "INSURANCE"
  | "DECLARATION"
  | "FORM"
  | "SIGNATURE"
  | "VISIT"
  | "REFERENCE"
  | "TECHNICAL_REQUIREMENT"
  | "FINANCIAL_REQUIREMENT"
  | "DEADLINE"
  | "DELIVERABLE"
  | "OTHER";

/** Mission §14 — catégorisation d'une pièce, jamais uniquement le nom du fichier. */
export function mapChecklistItemTypeToCategory(type: ChecklistItemTypeInput): PackageItemCategory {
  switch (type) {
    case "ADMINISTRATIVE_DOCUMENT":
    case "DECLARATION":
    case "FORM":
    case "SIGNATURE":
      return PackageItemCategory.Administrative;
    case "TECHNICAL_DOCUMENT":
    case "TECHNICAL_REQUIREMENT":
    case "DELIVERABLE":
      return PackageItemCategory.Technical;
    case "FINANCIAL_DOCUMENT":
    case "FINANCIAL_REQUIREMENT":
      return PackageItemCategory.Financial;
    case "CERTIFICATION":
    case "INSURANCE":
      return PackageItemCategory.Certificate;
    case "REFERENCE":
      return PackageItemCategory.Annex;
    case "VISIT":
    case "DEADLINE":
    case "OTHER":
      return PackageItemCategory.Other;
  }
}
