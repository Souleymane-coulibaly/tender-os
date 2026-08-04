import { AnnexStatus } from "./annex-status";
import { ChecklistPieceStatus } from "./checklist-piece-status";
import { ComplianceCoverageStatus } from "./compliance-coverage-status";
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

/**
 * Correctif — le statut d'un livrable en overlay léger (Annexes/Checklist/Matrice de conformité)
 * restait NOT_STARTED indéfiniment, quelle que soit la progression réelle de ses entrées : contrairement
 * aux livrables structurés (`deriveDeliverableStatus`, sections), ce recalcul n'avait jamais été
 * implémenté — un angle mort du Sprint 8A.1 ("overlay léger : entrées éditées directement, aucun
 * statut global calculé"), jamais un choix explicitement voulu pour le badge de la page liste.
 *
 * Règle volontairement simple et cohérente entre les 3 dérivations ci-dessous : NOT_STARTED tant
 * qu'aucune entrée n'a progressé, IN_PROGRESS dès qu'au moins une a progressé sans que toutes le
 * soient, READY_FOR_REVIEW quand TOUTES les entrées sont dans un état final positif,
 * CHANGES_REQUESTED si au moins une entrée signale un problème réel (jamais une simple entrée
 * encore en attente). Un livrable sans aucune entrée reste NOT_STARTED — jamais "prêt" par défaut.
 */
export function deriveAnnexesDeliverableStatus(statuses: readonly AnnexStatus[]): DeliverableStatus {
  if (statuses.length === 0) return DeliverableStatus.NotStarted;
  const progressed = statuses.filter((status) => status !== AnnexStatus.Pending).length;
  if (progressed === 0) return DeliverableStatus.NotStarted;
  if (progressed === statuses.length) return DeliverableStatus.ReadyForReview;
  return DeliverableStatus.InProgress;
}

/** EXPIRED/REJECTED signalent un vrai problème (une pièce fournie mais refusée/périmée) — jamais
 *  traité comme une simple pièce encore manquante. */
export function deriveChecklistDeliverableStatus(statuses: readonly ChecklistPieceStatus[]): DeliverableStatus {
  if (statuses.length === 0) return DeliverableStatus.NotStarted;
  if (statuses.some((status) => status === ChecklistPieceStatus.Rejected || status === ChecklistPieceStatus.Expired)) {
    return DeliverableStatus.ChangesRequested;
  }
  const done = statuses.filter((status) => status === ChecklistPieceStatus.Provided || status === ChecklistPieceStatus.Valid).length;
  if (done === 0) return DeliverableStatus.NotStarted;
  if (done === statuses.length) return DeliverableStatus.ReadyForReview;
  return DeliverableStatus.InProgress;
}

/** NOT_COVERED signale un vrai écart de conformité — jamais traité comme une simple exigence
 *  encore à confirmer (TO_CONFIRM, l'état par défaut à la création). */
export function deriveComplianceMatrixDeliverableStatus(statuses: readonly ComplianceCoverageStatus[]): DeliverableStatus {
  if (statuses.length === 0) return DeliverableStatus.NotStarted;
  if (statuses.some((status) => status === ComplianceCoverageStatus.NotCovered)) {
    return DeliverableStatus.ChangesRequested;
  }
  const done = statuses.filter((status) => status !== ComplianceCoverageStatus.ToConfirm).length;
  if (done === 0) return DeliverableStatus.NotStarted;
  if (done === statuses.length) return DeliverableStatus.ReadyForReview;
  return DeliverableStatus.InProgress;
}
