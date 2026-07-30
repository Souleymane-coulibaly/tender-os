/** Catégorie d'une exigence / pièce demandée (mission Sprint 4.2 §4 "Exigences et pièces demandées"). */
export const RequirementCategory = {
  Administrative: "ADMINISTRATIVE",
  TechnicalMemo: "TECHNICAL_MEMO",
  References: "REFERENCES",
  Cv: "CV",
  Certification: "CERTIFICATION",
  Insurance: "INSURANCE",
  FinancialCapacity: "FINANCIAL_CAPACITY",
  TechnicalCapacity: "TECHNICAL_CAPACITY",
  HumanResources: "HUMAN_RESOURCES",
  MaterialResources: "MATERIAL_RESOURCES",
  Methodology: "METHODOLOGY",
  Planning: "PLANNING",
  Signature: "SIGNATURE",
  Other: "OTHER",
} as const;

export type RequirementCategory = (typeof RequirementCategory)[keyof typeof RequirementCategory];

export function isRequirementCategory(value: string): value is RequirementCategory {
  return Object.values(RequirementCategory).includes(value as RequirementCategory);
}
