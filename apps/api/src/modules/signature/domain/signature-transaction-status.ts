/** Mission Sprint 8A §46 — mapping INTERNE, jamais les statuts bruts du prestataire persistés ici
 *  (voir `SignatureProviderEvent.eventType` pour la trace brute). N'ajoute que les statuts
 *  réellement nécessaires. */
export const SignatureTransactionStatus = {
  Preparing: "PREPARING",
  ReadyToSend: "READY_TO_SEND",
  Sent: "SENT",
  InProgress: "IN_PROGRESS",
  Signed: "SIGNED",
  Verified: "VERIFIED",
  Declined: "DECLINED",
  Cancelled: "CANCELLED",
  Expired: "EXPIRED",
  Failed: "FAILED",
  Invalid: "INVALID",
} as const;

export type SignatureTransactionStatus = (typeof SignatureTransactionStatus)[keyof typeof SignatureTransactionStatus];

/** Mission §46 "une transition incohérente doit être refusée". SIGNED → VERIFIED exige TOUJOURS
 *  une vérification explicite (mission "un statut SIGNED non vérifié ne doit pas produire
 *  automatiquement VERIFIED") — jamais une transition automatique webhook → VERIFIED. */
const ALLOWED_TRANSITIONS: Record<SignatureTransactionStatus, readonly SignatureTransactionStatus[]> = {
  [SignatureTransactionStatus.Preparing]: [SignatureTransactionStatus.ReadyToSend, SignatureTransactionStatus.Failed, SignatureTransactionStatus.Invalid],
  [SignatureTransactionStatus.ReadyToSend]: [SignatureTransactionStatus.Sent, SignatureTransactionStatus.Failed, SignatureTransactionStatus.Cancelled],
  [SignatureTransactionStatus.Sent]: [
    SignatureTransactionStatus.InProgress,
    SignatureTransactionStatus.Signed,
    SignatureTransactionStatus.Declined,
    SignatureTransactionStatus.Cancelled,
    SignatureTransactionStatus.Expired,
    SignatureTransactionStatus.Failed,
  ],
  [SignatureTransactionStatus.InProgress]: [
    SignatureTransactionStatus.Signed,
    SignatureTransactionStatus.Declined,
    SignatureTransactionStatus.Cancelled,
    SignatureTransactionStatus.Expired,
    SignatureTransactionStatus.Failed,
  ],
  [SignatureTransactionStatus.Signed]: [SignatureTransactionStatus.Verified, SignatureTransactionStatus.Invalid],
  [SignatureTransactionStatus.Verified]: [],
  [SignatureTransactionStatus.Declined]: [],
  [SignatureTransactionStatus.Cancelled]: [],
  [SignatureTransactionStatus.Expired]: [],
  [SignatureTransactionStatus.Failed]: [],
  [SignatureTransactionStatus.Invalid]: [],
};

export function canTransitionSignatureTransaction(from: SignatureTransactionStatus, to: SignatureTransactionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Un statut sans transition sortante dans `ALLOWED_TRANSITIONS` — même définition que celle
 *  utilisée par `CreateSubmissionPackageUseCase` (submission-package) et
 *  `GetReadinessStatusUseCase` (validation, mission Sprint 8A.2 bug #5) : une seule source de
 *  vérité pour "cette transaction n'évoluera plus", jamais deux ensembles divergents. */
export function isTerminalSignatureTransactionStatus(status: SignatureTransactionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
