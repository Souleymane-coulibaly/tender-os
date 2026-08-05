/** Sprint 8C Phase 1 — origine d'une exigence administrative (mission §8). */
export const AdministrativeRequirementOrigin = {
  Manual: "MANUAL",
  DceAnalysis: "DCE_ANALYSIS",
  BuyerTemplate: "BUYER_TEMPLATE",
  TenderosRule: "TENDEROS_RULE",
} as const;

export type AdministrativeRequirementOrigin = (typeof AdministrativeRequirementOrigin)[keyof typeof AdministrativeRequirementOrigin];

export function isAdministrativeRequirementOrigin(value: string): value is AdministrativeRequirementOrigin {
  return Object.values(AdministrativeRequirementOrigin).includes(value as AdministrativeRequirementOrigin);
}
