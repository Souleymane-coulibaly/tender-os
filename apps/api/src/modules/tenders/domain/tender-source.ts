import { InvalidTenderSourceError } from "./errors";

/**
 * Provenance du Tender (mission architecture §6) — MANUAL pour tout dépôt saisi à la main ;
 * BOAMP/TED/PRIVATE réutilisés tels quels par le module `market-watch` (V2 Sprint 17, connecteurs
 * de veille réels — `market-watch/application/ports/market-source-connector.ts`) pour qualifier la
 * provenance d'un `ExternalTender`. La source ne doit jamais changer le comportement interne du
 * moteur DCE (mission §7) : un Tender promu depuis un ExternalTender entre dans le même pipeline
 * qu'un Tender créé manuellement.
 */
export const TenderSource = {
  Manual: "MANUAL",
  Boamp: "BOAMP",
  Ted: "TED",
  Private: "PRIVATE",
  Other: "OTHER",
} as const;

export type TenderSource = (typeof TenderSource)[keyof typeof TenderSource];

export function isTenderSource(value: string): value is TenderSource {
  return Object.values(TenderSource).includes(value as TenderSource);
}

export function parseTenderSource(value: string): TenderSource {
  if (!isTenderSource(value)) {
    throw new InvalidTenderSourceError(value);
  }
  return value;
}
