export type ValidationIssueSummary = {
  id: string;
  ruleCode: string;
  severity: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
  source?: string;
  recommendation?: string;
  detectedAt: string;
  resolutionStatus: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

export type ValidationRunSummary = {
  id: string;
  tenderId: string;
  exportJobId: string;
  readinessStatus: string;
  runBy: string;
  runAt: string;
  issues: ValidationIssueSummary[];
};

export type FinalApprovalSummary = {
  id: string;
  tenderId: string;
  exportJobId: string;
  validationRunId: string;
  manifestHash: string;
  approvedBy: string;
  approverRole: string;
  approvedAt: string;
  comment?: string;
  status: string;
  invalidatedAt?: string;
  invalidatedReason?: string;
};

export type ReadinessStatusResult = {
  status: string;
  latestValidationRunId?: string;
  activeApprovalId?: string;
};

export const READINESS_STATUS_LABELS: Record<string, string> = {
  NOT_READY: "Non prêt",
  BLOCKED: "Bloqué",
  READY_WITH_WARNINGS: "Prêt avec avertissements",
  READY_FOR_APPROVAL: "Prêt pour approbation",
  APPROVED: "Approuvé",
  READY_FOR_SIGNATURE: "Prêt pour signature",
  SIGNATURE_IN_PROGRESS: "Signature en cours",
  PARTIALLY_SIGNED: "Partiellement signé",
  READY_FOR_SUBMISSION: "Prêt pour soumission",
};

export function readinessStatusBadgeClass(status: string): string {
  switch (status) {
    case "READY_FOR_SUBMISSION":
    case "APPROVED":
    case "READY_FOR_APPROVAL":
      return "bg-green-100 text-green-800";
    case "READY_WITH_WARNINGS":
    case "SIGNATURE_IN_PROGRESS":
    case "PARTIALLY_SIGNED":
    case "READY_FOR_SIGNATURE":
      return "bg-amber-100 text-amber-800";
    case "BLOCKED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export const VALIDATION_SEVERITY_LABELS: Record<string, string> = { BLOCKING: "Bloquant", WARNING: "Avertissement" };

export function validationSeverityBadgeClass(severity: string): string {
  return severity === "BLOCKING" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
}

export const VALIDATION_RESOLUTION_STATUS_LABELS: Record<string, string> = { OPEN: "Ouvert", RESOLVED: "Résolu", REOPENED: "Rouvert" };

/** Vérification UI uniquement — le backend revalide toujours via `AssertClientAccessUseCase` +
 *  `ClientPermission.ManageExport`/`ApproveExport` selon l'action. */
export function canManageValidation(role: string | undefined): boolean {
  return role !== undefined && role !== "READ_ONLY" && role !== "EXTERNAL_CONSULTANT";
}

/** Mission Sprint 8A bis §31 — approuver/rouvrir une version finale est une action "règle
 *  stricte" (`ClientPermission.ApproveExport`) : UI uniquement, jamais une autorité. */
export function canApproveValidation(role: string | undefined): boolean {
  return role !== undefined && ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"].includes(role);
}
