// Sprint 9 — dépôt manuel assisté et suivi de soumission.

export type SubmissionProofSummary = {
  id: string;
  submissionId: string;
  documentId: string;
  documentVersionId: string;
  proofType: string;
  hash: string;
  uploadedByUserId: string;
  uploadedAt: string;
};

export type TenderSubmissionSummary = {
  id: string;
  tenderId: string;
  packageId: string;
  packageVersion: number;
  packageHash: string;
  manifestHash?: string;
  status: string;
  submittedByUserId?: string;
  submittedAt?: string;
  platform: string;
  customPlatformName?: string;
  platformReference?: string;
  receiptReference?: string;
  notes?: string;
  supersedesSubmissionId?: string;
  replacedBySubmissionId?: string;
  withdrawnAt?: string;
  withdrawnByUserId?: string;
  withdrawalReason?: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancellationReason?: string;
  rejectionCategory?: string;
  rejectionDescription?: string;
  receiptConfirmedAt?: string;
  receiptConfirmedByUserId?: string;
  externalSubmissionUrl?: string;
  createdAt: string;
  updatedAt: string;
  proofs: SubmissionProofSummary[];
};

// Checkpoint 2.1-P2.1-FIX-F — miroir exact de `SubmissionReadinessReason`
// (apps/api/.../submission/domain/submission-readiness-reason.ts). Le frontend ne recalcule
// jamais la sévérité/le code : il affiche tel quel ce que le backend a déjà classifié.
export type SubmissionReadinessReasonSeverity = "BLOCKING" | "WARNING" | "INFORMATIONAL";

export type SubmissionReadinessAction = "REANALYZE_DCE" | "RECONCILE_CHECKLIST" | "RECALCULATE_GONOGO" | "REGENERATE_TECHNICAL_MEMO" | "REVALIDATE" | "REGENERATE_RESPONSE_PACKAGE";

export type SubmissionReadinessReason = {
  code: string;
  severity: SubmissionReadinessReasonSeverity;
  source: string;
  message: string;
  action?: SubmissionReadinessAction;
};

export type TenderSubmissionReadinessResult = {
  canSubmit: boolean;
  readinessStatus: string;
  blockers: string[];
  warnings: string[];
  requiredActions: string[];
  packageId?: string;
  packageVersion?: number;
  packageHash?: string;
  deadline?: string;
  remainingTimeMs?: number;
  signatureRequirement: string;
  validationSummary: string;
  activeSubmissionId?: string;
  // Checkpoint 2.1-P2.1-FIX-F — additif : dimensions DCE/Analyse/Checklist/GO-NO-GO/Mémoire
  // technique/Validation-fraîcheur/Dossier de réponse. Leurs messages sont AUSSI déjà inclus dans
  // `blockers`/`warnings` ci-dessus (contrat existant préservé) ; ce champ apporte le code/action
  // structuré pour permettre un lien "corriger" par dimension.
  fileReadinessReasons: SubmissionReadinessReason[];
};

// Checkpoint 2.1-P2.1-FIX-F — mission §81 "le frontend mappe action → route", jamais une URL
// portée par le backend. Miroir des routes canoniques de `tender-nav-tabs.ts`. GO/NO-GO n'a pas
// de sous-route dédiée : il vit sur la page Vue d'ensemble du dossier.
export function submissionReadinessActionRoute(tenderId: string, action: SubmissionReadinessAction): string {
  const base = `/app/tenders/${tenderId}`;
  switch (action) {
    case "REANALYZE_DCE":
      return `${base}/analysis`;
    case "RECONCILE_CHECKLIST":
      return `${base}/checklist`;
    case "RECALCULATE_GONOGO":
      return base;
    case "REGENERATE_TECHNICAL_MEMO":
      return `${base}/technical-memo`;
    case "REVALIDATE":
      return `${base}/validation`;
    case "REGENERATE_RESPONSE_PACKAGE":
      return `${base}/response-package`;
  }
}

export const SUBMISSION_READINESS_ACTION_LABELS: Record<SubmissionReadinessAction, string> = {
  REANALYZE_DCE: "Relancer l'analyse du DCE",
  RECONCILE_CHECKLIST: "Réconcilier la checklist",
  RECALCULATE_GONOGO: "Recalculer le GO/NO-GO",
  REGENERATE_TECHNICAL_MEMO: "Régénérer le mémoire technique",
  REVALIDATE: "Revalider le dossier",
  REGENERATE_RESPONSE_PACKAGE: "Régénérer le dossier de réponse",
};

export type TenderSubmissionCapabilities = {
  canViewSubmission: boolean;
  canPrepareSubmission: boolean;
  canRecordSubmission: boolean;
  canUploadProof: boolean;
  canConfirmReceipt: boolean;
  canReplaceSubmission: boolean;
  canWithdrawSubmission: boolean;
  canCancelSubmission: boolean;
  canRecordRejection: boolean;
  activeSubmissionId?: string;
  readiness: TenderSubmissionReadinessResult;
  blockers: string[];
  warnings: string[];
  availableActions: string[];
  reasonsByAction: Record<string, string>;
};

export const SUBMISSION_PLATFORM_LABELS: Record<string, string> = {
  PLACE: "PLACE",
  AWS_ACHAT: "AWS-Achat",
  MARCHES_SECURISES: "Marchés Sécurisés",
  MAXIMILIEN: "Maximilien",
  ACHATPUBLIC: "AchatPublic",
  MEGALIS: "Mégalis",
  E_MARCHES_PUBLICS: "e-Marchés Publics",
  PLATEFORME_ACHETEUR: "Plateforme acheteur (nom libre)",
  OTHER: "Autre",
};

export const SUBMISSION_PROOF_TYPE_LABELS: Record<string, string> = {
  RECEIPT: "Reçu",
  ACKNOWLEDGEMENT: "Accusé de réception",
  SCREENSHOT: "Capture d'écran",
  PLATFORM_CONFIRMATION: "Confirmation plateforme",
  OTHER: "Autre",
};

export const SUBMISSION_REJECTION_CATEGORY_LABELS: Record<string, string> = {
  FILE_REJECTED: "Fichier refusé",
  SIZE_EXCEEDED: "Taille dépassée",
  INVALID_FORMAT: "Format invalide",
  ANTIVIRUS: "Antivirus",
  SIGNATURE_REJECTED: "Signature refusée",
  SESSION_EXPIRED: "Session expirée",
  OTHER: "Autre",
};

export const TENDER_SUBMISSION_STATUS_LABELS: Record<string, string> = {
  SUBMISSION_IN_PROGRESS: "Dépôt en cours",
  SUBMITTED: "Déposé",
  RECEIPT_CONFIRMED: "Reçu confirmé",
  SUBMISSION_REJECTED: "Rejeté",
  WITHDRAWN: "Retiré",
  REPLACED: "Remplacé",
  CANCELLED: "Annulé",
};
