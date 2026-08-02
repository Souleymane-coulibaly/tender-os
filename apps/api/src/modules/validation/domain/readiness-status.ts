/**
 * Mission Sprint 8A §27/§30 — statut calculé EXCLUSIVEMENT côté backend, jamais reconstruit par le
 * frontend. `ValidationRun.readinessStatus` ne persiste jamais qu'un sous-ensemble de ces valeurs
 * (celles calculables avant toute approbation/signature) — la valeur complète, incluant APPROVED /
 * READY_FOR_SIGNATURE / SIGNATURE_IN_PROGRESS / PARTIALLY_SIGNED / READY_FOR_SUBMISSION, est
 * recalculée à la demande par `GetReadinessStatusUseCase` en croisant Validation + Signature +
 * Package (mission "n'utilise que les statuts réellement nécessaires").
 */
export const ReadinessStatus = {
  NotReady: "NOT_READY",
  ReadyWithWarnings: "READY_WITH_WARNINGS",
  ReadyForApproval: "READY_FOR_APPROVAL",
  Approved: "APPROVED",
  ReadyForSignature: "READY_FOR_SIGNATURE",
  SignatureInProgress: "SIGNATURE_IN_PROGRESS",
  PartiallySigned: "PARTIALLY_SIGNED",
  ReadyForSubmission: "READY_FOR_SUBMISSION",
  Blocked: "BLOCKED",
} as const;

export type ReadinessStatus = (typeof ReadinessStatus)[keyof typeof ReadinessStatus];

/** Sous-ensemble persistable sur `ValidationRun` — calculable à partir des seules issues d'un run,
 *  avant toute approbation. */
export type PersistableValidationReadinessStatus =
  | typeof ReadinessStatus.NotReady
  | typeof ReadinessStatus.ReadyWithWarnings
  | typeof ReadinessStatus.ReadyForApproval
  | typeof ReadinessStatus.Blocked;
