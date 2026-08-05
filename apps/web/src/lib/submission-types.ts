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
