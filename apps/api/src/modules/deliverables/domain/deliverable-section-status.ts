import { DeliverableRevisionStatus } from "./deliverable-revision-status";

/** Mission §15 — "le statut doit être calculé et contrôlé côté backend" : `DeliverableSection.status`
 *  n'est jamais transité par une commande directe, il est DÉRIVÉ de la révision la plus récente de
 *  la section (voir `deriveDeliverableSectionStatus`). */
export const DeliverableSectionStatus = {
  NotStarted: "NOT_STARTED",
  Draft: "DRAFT",
  InProgress: "IN_PROGRESS",
  ReadyForReview: "READY_FOR_REVIEW",
  ChangesRequested: "CHANGES_REQUESTED",
  Validated: "VALIDATED",
} as const;

export type DeliverableSectionStatus = (typeof DeliverableSectionStatus)[keyof typeof DeliverableSectionStatus];

/**
 * Dérivation PURE (aucune E/S) du statut d'une section à partir de sa révision la plus récente
 * (numéro de révision le plus élevé, indépendamment de la révision sélectionnée pour l'export —
 * mission §11 "la sélection pour l'export est un fait séparé du statut de travail en cours").
 * `editVersion > 0` distingue une section encore vierge (`DRAFT`, jamais retouchée depuis sa
 * génération/création) d'une section réellement en cours de rédaction (`IN_PROGRESS`).
 */
export function deriveDeliverableSectionStatus(
  latestRevision: { status: DeliverableRevisionStatus; editVersion: number } | undefined,
): DeliverableSectionStatus {
  if (!latestRevision) {
    return DeliverableSectionStatus.NotStarted;
  }
  switch (latestRevision.status) {
    case DeliverableRevisionStatus.Draft:
      return latestRevision.editVersion > 0 ? DeliverableSectionStatus.InProgress : DeliverableSectionStatus.Draft;
    case DeliverableRevisionStatus.ReadyForReview:
      return DeliverableSectionStatus.ReadyForReview;
    case DeliverableRevisionStatus.ChangesRequested:
    case DeliverableRevisionStatus.Rejected:
      return DeliverableSectionStatus.ChangesRequested;
    case DeliverableRevisionStatus.Validated:
      return DeliverableSectionStatus.Validated;
    case DeliverableRevisionStatus.Archived:
      // Une révision ARCHIVED ne devrait jamais être "la plus récente" (mission — l'archivage ne
      // s'applique qu'à une révision déjà supplantée) ; repli défensif sur NOT_STARTED plutôt que
      // de propager un statut trompeur.
      return DeliverableSectionStatus.NotStarted;
    default:
      return DeliverableSectionStatus.NotStarted;
  }
}
