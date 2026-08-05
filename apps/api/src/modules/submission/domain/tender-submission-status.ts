/**
 * Sprint 9 — statuts PERSISTÉS d'une `TenderSubmission` (mission §7). `NOT_SUBMITTED` et
 * `READY_FOR_SUBMISSION` ne figurent PAS ici : ce sont des valeurs purement calculées par
 * `GetTenderSubmissionReadinessUseCase` avant qu'aucune ligne n'existe (même logique que
 * `ReadinessStatus` côté `validation`, jamais persistées) — une soumission n'existe qu'à partir de
 * `SUBMISSION_IN_PROGRESS` ou `SUBMITTED`.
 */
export const TenderSubmissionStatus = {
  SubmissionInProgress: "SUBMISSION_IN_PROGRESS",
  Submitted: "SUBMITTED",
  ReceiptConfirmed: "RECEIPT_CONFIRMED",
  SubmissionRejected: "SUBMISSION_REJECTED",
  Withdrawn: "WITHDRAWN",
  Replaced: "REPLACED",
  Cancelled: "CANCELLED",
} as const;

export type TenderSubmissionStatus = (typeof TenderSubmissionStatus)[keyof typeof TenderSubmissionStatus];

/** Mission §7 — transitions explicites et contrôlées, jamais un statut envoyé arbitrairement par le
 *  frontend (mission §22). Une soumission REPLACED/WITHDRAWN/CANCELLED/SUBMISSION_REJECTED reste
 *  conservée (terminal — aucune sortie), mais REJECTED/WITHDRAWN restent référençables par un
 *  remplacement ultérieur créé comme une NOUVELLE ligne (jamais une réouverture de celle-ci). */
const ALLOWED_TRANSITIONS: Record<TenderSubmissionStatus, readonly TenderSubmissionStatus[]> = {
  [TenderSubmissionStatus.SubmissionInProgress]: [TenderSubmissionStatus.Submitted, TenderSubmissionStatus.Cancelled],
  [TenderSubmissionStatus.Submitted]: [
    TenderSubmissionStatus.ReceiptConfirmed,
    TenderSubmissionStatus.SubmissionRejected,
    TenderSubmissionStatus.Replaced,
    TenderSubmissionStatus.Withdrawn,
  ],
  [TenderSubmissionStatus.ReceiptConfirmed]: [TenderSubmissionStatus.Replaced, TenderSubmissionStatus.Withdrawn],
  [TenderSubmissionStatus.SubmissionRejected]: [],
  [TenderSubmissionStatus.Withdrawn]: [],
  [TenderSubmissionStatus.Replaced]: [],
  [TenderSubmissionStatus.Cancelled]: [],
};

export function canTransitionTenderSubmissionStatus(from: TenderSubmissionStatus, to: TenderSubmissionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Une soumission est "en vol" (occupe l'unicité "une soumission active par Tender", mission §31) tant
 *  qu'elle n'est pas dans un état terminal historique. */
export function isInFlightTenderSubmissionStatus(status: TenderSubmissionStatus): boolean {
  return (
    status === TenderSubmissionStatus.SubmissionInProgress ||
    status === TenderSubmissionStatus.Submitted ||
    status === TenderSubmissionStatus.ReceiptConfirmed
  );
}
