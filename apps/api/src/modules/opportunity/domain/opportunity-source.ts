import { InvalidOpportunitySourceError } from "./errors";

/**
 * Provenance de l'Opportunity (mission §4) — MANUAL est la seule source PRODUITE ce sprint (saisie
 * manuelle) ; BOAMP/TED/PRIVATE sont un catalogue préparé pour de futurs connecteurs, aucun
 * connecteur réel n'existe dans cette tranche (mission §4 "n'implémenter aucun connecteur dans ce
 * sprint").
 */
export const OpportunitySource = {
  Manual: "MANUAL",
  Boamp: "BOAMP",
  Ted: "TED",
  Private: "PRIVATE",
} as const;

export type OpportunitySource = (typeof OpportunitySource)[keyof typeof OpportunitySource];

export function isOpportunitySource(value: string): value is OpportunitySource {
  return Object.values(OpportunitySource).includes(value as OpportunitySource);
}

export function parseOpportunitySource(value: string): OpportunitySource {
  if (!isOpportunitySource(value)) {
    throw new InvalidOpportunitySourceError(value);
  }
  return value;
}
