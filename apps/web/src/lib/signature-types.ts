export type SignatureRequirementSummary = {
  id: string;
  tenderId: string;
  documentRef: string;
  sourceDce?: string;
  pageOrSection?: string;
  mandatory: boolean;
  levelExpected?: string;
  confidence: string;
  status: string;
  confirmedBy?: string;
  confirmedAt?: string;
  comment?: string;
  createdAt: string;
};

export type SignatorySummary = {
  id: string;
  tenderId: string;
  firstName: string;
  lastName: string;
  professionalEmail: string;
  jobTitle?: string;
  organizationName?: string;
  status: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
};

export type SignatureArtifactSummary = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  isFakeTestEvidence: boolean;
  source: string;
  verificationStatus?: string;
  createdAt: string;
};

export type SignatureParticipantSummary = { id: string; signatoryId: string; sequence: number; status: string };

export type SignatureTransactionSummary = {
  id: string;
  tenderId: string;
  exportArtifactId: string;
  provider: string;
  status: string;
  requestedLevel?: string;
  confirmedLevel?: string;
  documentHash: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  participants: SignatureParticipantSummary[];
  artifacts: SignatureArtifactSummary[];
};

export const SIGNATURE_LEVELS = ["LEVEL0", "LEVEL1", "LEVEL2", "LEVEL3", "LEVEL4"] as const;

export const SIGNATURE_REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  DETECTED: "Détectée",
  CONFIRMED: "Confirmée",
  REJECTED: "Rejetée",
  UNKNOWN: "Indéterminée",
};

export const SIGNATORY_STATUS_LABELS: Record<string, string> = { PENDING: "En attente", VERIFIED: "Vérifié", REJECTED: "Rejeté" };

export const SIGNATURE_TRANSACTION_STATUS_LABELS: Record<string, string> = {
  PREPARING: "Préparation",
  READY_TO_SEND: "Prêt à envoyer",
  SENT: "Envoyé",
  IN_PROGRESS: "En cours",
  SIGNED: "Signé (non vérifié)",
  VERIFIED: "Signé et vérifié",
  DECLINED: "Refusé",
  CANCELLED: "Annulé",
  EXPIRED: "Expiré",
  FAILED: "Échec",
  INVALID: "Invalide",
};

export function signatureStatusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "VERIFIED":
      return "bg-green-100 text-green-800";
    case "DETECTED":
    case "PENDING":
    case "PREPARING":
    case "READY_TO_SEND":
    case "SENT":
    case "IN_PROGRESS":
    case "SIGNED":
      return "bg-amber-100 text-amber-800";
    case "REJECTED":
    case "DECLINED":
    case "CANCELLED":
    case "EXPIRED":
    case "FAILED":
    case "INVALID":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

/** Vérification UI uniquement — le backend revalide toujours via `AssertClientAccessUseCase` +
 *  `ClientPermission.ManageExport`/`ApproveExport` selon l'action (voir chaque use case Signature). */
export function canManageSignature(role: string | undefined): boolean {
  return role !== undefined && role !== "READ_ONLY" && role !== "EXTERNAL_CONSULTANT";
}

/** Mission Sprint 8A bis §37/§42 — affecter un signataire, vérifier son pouvoir, préparer/démarrer
 *  une transaction sont des actions "règle stricte" (`ClientPermission.ApproveExport`). */
export function canApproveSignature(role: string | undefined): boolean {
  return role !== undefined && ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"].includes(role);
}
