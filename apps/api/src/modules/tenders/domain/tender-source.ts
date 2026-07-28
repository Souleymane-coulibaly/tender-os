import { InvalidTenderSourceError } from "./errors";

/**
 * Provenance du Tender (mission architecture §6) — MANUAL aujourd'hui pour tout dépôt saisi à la
 * main ; BOAMP/TED/PRIVATE préparés pour de futurs connecteurs (`TenderSourceConnector`, voir
 * application/ports/tender-source-connector.ts) mais aucun connecteur réel n'existe dans cette
 * tranche. La source ne doit jamais changer le comportement interne du moteur DCE (mission §7).
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
