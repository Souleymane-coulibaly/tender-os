import { DeliverableSectionStatus } from "./deliverable-section-status";

/** Mission §15 — statut global d'un livrable, également DÉRIVÉ ("calculé et contrôlé côté
 *  backend"), jamais transité librement par une commande directe. */
export const DeliverableStatus = {
  NotStarted: "NOT_STARTED",
  Draft: "DRAFT",
  InProgress: "IN_PROGRESS",
  ReadyForReview: "READY_FOR_REVIEW",
  ChangesRequested: "CHANGES_REQUESTED",
  Validated: "VALIDATED",
  Approved: "APPROVED",
  Exported: "EXPORTED",
  Blocked: "BLOCKED",
} as const;

export type DeliverableStatus = (typeof DeliverableStatus)[keyof typeof DeliverableStatus];

const SECTION_RANK: Record<DeliverableSectionStatus, number> = {
  [DeliverableSectionStatus.NotStarted]: 0,
  [DeliverableSectionStatus.Draft]: 1,
  [DeliverableSectionStatus.InProgress]: 2,
  [DeliverableSectionStatus.ChangesRequested]: 3,
  [DeliverableSectionStatus.ReadyForReview]: 4,
  [DeliverableSectionStatus.Validated]: 5,
};

/**
 * Dérivation PURE du statut global d'un livrable structuré (Mémoire technique/Synthèse exécutive)
 * à partir du statut de ses sections visibles et non facultatives-absentes, plus les faits explicites
 * `approvedAt`/`exportedAt` (mission §15). `BLOCKED` prévaut sur tout — signalé explicitement par
 * l'appelant (ex. section obligatoire manquante, dépendance externe bloquée), jamais déduit ici des
 * seuls statuts de section pour éviter toute ambiguïté avec `CHANGES_REQUESTED`.
 */
export function deriveDeliverableStatus(input: {
  sectionStatuses: readonly DeliverableSectionStatus[];
  approvedAt?: Date | undefined;
  exportedAt?: Date | undefined;
  blocked?: boolean | undefined;
}): DeliverableStatus {
  if (input.blocked) {
    return DeliverableStatus.Blocked;
  }
  if (input.exportedAt) {
    return DeliverableStatus.Exported;
  }
  if (input.approvedAt) {
    return DeliverableStatus.Approved;
  }
  if (input.sectionStatuses.length === 0) {
    return DeliverableStatus.NotStarted;
  }
  if (input.sectionStatuses.every((status) => status === DeliverableSectionStatus.Validated)) {
    return DeliverableStatus.Validated;
  }
  if (input.sectionStatuses.some((status) => status === DeliverableSectionStatus.ChangesRequested)) {
    return DeliverableStatus.ChangesRequested;
  }
  if (input.sectionStatuses.every((status) => status === DeliverableSectionStatus.ReadyForReview || status === DeliverableSectionStatus.Validated)) {
    return DeliverableStatus.ReadyForReview;
  }
  const worst = input.sectionStatuses.reduce((min, status) => Math.min(min, SECTION_RANK[status]), SECTION_RANK[DeliverableSectionStatus.Validated]);
  if (worst === SECTION_RANK[DeliverableSectionStatus.NotStarted]) {
    return input.sectionStatuses.some((status) => status !== DeliverableSectionStatus.NotStarted) ? DeliverableStatus.InProgress : DeliverableStatus.NotStarted;
  }
  if (worst === SECTION_RANK[DeliverableSectionStatus.Draft]) {
    return DeliverableStatus.Draft;
  }
  return DeliverableStatus.InProgress;
}
