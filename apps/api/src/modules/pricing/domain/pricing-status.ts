import { InvalidPricingScopeError } from "./errors";

/**
 * Statuts d'une `PricingEstimateVersion` (mission Sprint 7 §"Statuts" — "ne crée pas des statuts
 * inutiles"). `DRAFT` n'est jamais persisté seul : une version est créée déjà `CALCULATED`/
 * `PARTIAL`/`UNKNOWN` selon la disponibilité des données au moment du calcul (voir
 * `CreatePricingEstimateUseCase`) — `DRAFT` existe pour un usage futur (ex. formulaire multi-étapes)
 * sans être atteint dans cette tranche, jamais un état mort supprimé.
 */
export const PricingStatus = {
  Draft: "DRAFT",
  Calculated: "CALCULATED",
  Partial: "PARTIAL",
  Unknown: "UNKNOWN",
  Superseded: "SUPERSEDED",
  Archived: "ARCHIVED",
} as const;

export type PricingStatus = (typeof PricingStatus)[keyof typeof PricingStatus];

export function isPricingStatus(value: string): value is PricingStatus {
  return Object.values(PricingStatus).includes(value as PricingStatus);
}

export function parsePricingStatus(value: string): PricingStatus {
  if (!isPricingStatus(value)) {
    throw new InvalidPricingScopeError(`"${value}" is not a known pricing status`);
  }
  return value;
}
