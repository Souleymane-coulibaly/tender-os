import { InvalidTenderCountryError } from "./errors";

/**
 * Préparation internationale (mission architecture §12) — ensemble minimal FR/Europe + OTHER,
 * jamais de logique métier spécifique à un pays branchée sur cette valeur dans cette tranche.
 */
export const TenderCountry = {
  FR: "FR",
  BE: "BE",
  DE: "DE",
  ES: "ES",
  IT: "IT",
  LU: "LU",
  NL: "NL",
  EU: "EU",
  Other: "OTHER",
} as const;

export type TenderCountry = (typeof TenderCountry)[keyof typeof TenderCountry];

export function isTenderCountry(value: string): value is TenderCountry {
  return Object.values(TenderCountry).includes(value as TenderCountry);
}

export function parseTenderCountry(value: string): TenderCountry {
  if (!isTenderCountry(value)) {
    throw new InvalidTenderCountryError(value);
  }
  return value;
}
