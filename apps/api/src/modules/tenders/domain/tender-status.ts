import { InvalidTenderStatusError } from "./errors";

/**
 * Statuts de préparation de réponse (mission Tenders §4) — distincts du `tenders.status`
 * de découverte documenté en docs/04-architecture/DATABASE_DESIGN.md §8.3 (module
 * Discovery/Qualification non implémenté). Aucun statut canonique n'existant pour ce
 * périmètre, utilise exactement l'ensemble minimal proposé par la mission.
 */
export const TenderStatus = {
  Draft: "DRAFT",
  InAnalysis: "IN_ANALYSIS",
  Ready: "READY",
  InPreparation: "IN_PREPARATION",
  ReadyToSubmit: "READY_TO_SUBMIT",
  Submitted: "SUBMITTED",
  Won: "WON",
  Lost: "LOST",
  Archived: "ARCHIVED",
} as const;

export type TenderStatus = (typeof TenderStatus)[keyof typeof TenderStatus];

/**
 * Funnel explicite (mission §4) : archivage possible depuis tout état non déjà archivé ;
 * SUBMITTED atteignable uniquement depuis READY_TO_SUBMIT ; WON/LOST uniquement depuis
 * SUBMITTED ; ARCHIVED est terminal (aucune transition sortante normale).
 */
export const ALLOWED_TENDER_TRANSITIONS: Record<TenderStatus, readonly TenderStatus[]> = {
  [TenderStatus.Draft]: [TenderStatus.InAnalysis, TenderStatus.Archived],
  [TenderStatus.InAnalysis]: [TenderStatus.Ready, TenderStatus.Draft, TenderStatus.Archived],
  [TenderStatus.Ready]: [TenderStatus.InPreparation, TenderStatus.InAnalysis, TenderStatus.Archived],
  [TenderStatus.InPreparation]: [TenderStatus.ReadyToSubmit, TenderStatus.Ready, TenderStatus.Archived],
  [TenderStatus.ReadyToSubmit]: [TenderStatus.Submitted, TenderStatus.InPreparation, TenderStatus.Archived],
  [TenderStatus.Submitted]: [TenderStatus.Won, TenderStatus.Lost, TenderStatus.Archived],
  [TenderStatus.Won]: [TenderStatus.Archived],
  [TenderStatus.Lost]: [TenderStatus.Archived],
  [TenderStatus.Archived]: [],
};

export function isTenderStatus(value: string): value is TenderStatus {
  return Object.values(TenderStatus).includes(value as TenderStatus);
}

export function parseTenderStatus(value: string): TenderStatus {
  if (!isTenderStatus(value)) {
    throw new InvalidTenderStatusError(value);
  }
  return value;
}
