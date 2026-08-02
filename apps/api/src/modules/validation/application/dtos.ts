import type { FinalApproval } from "../domain/final-approval.aggregate";
import type { ValidationIssue } from "../domain/validation-issue";
import type { ValidationRun } from "../domain/validation-run.aggregate";

export type ValidationIssueSummary = {
  id: string;
  ruleCode: string;
  severity: string;
  message: string;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  source?: string | undefined;
  recommendation?: string | undefined;
  detectedAt: string;
  resolutionStatus: string;
  resolvedAt?: string | undefined;
  resolvedBy?: string | undefined;
  resolutionNote?: string | undefined;
};

export function toValidationIssueSummary(issue: ValidationIssue): ValidationIssueSummary {
  return {
    id: issue.id,
    ruleCode: issue.ruleCode,
    severity: issue.severity,
    message: issue.message,
    resourceType: issue.resourceType,
    resourceId: issue.resourceId,
    source: issue.source,
    recommendation: issue.recommendation,
    detectedAt: issue.detectedAt.toISOString(),
    resolutionStatus: issue.resolutionStatus,
    resolvedAt: issue.resolvedAt?.toISOString(),
    resolvedBy: issue.resolvedBy,
    resolutionNote: issue.resolutionNote,
  };
}

export type ValidationRunSummary = {
  id: string;
  tenderId: string;
  exportJobId: string;
  readinessStatus: string;
  runBy: string;
  runAt: string;
  issues: readonly ValidationIssueSummary[];
};

export function toValidationRunSummary(run: ValidationRun): ValidationRunSummary {
  return {
    id: run.id,
    tenderId: run.tenderId,
    exportJobId: run.exportJobId,
    readinessStatus: run.readinessStatus,
    runBy: run.runBy,
    runAt: run.runAt.toISOString(),
    issues: run.issues.map(toValidationIssueSummary),
  };
}

export type FinalApprovalSummary = {
  id: string;
  tenderId: string;
  exportJobId: string;
  validationRunId: string;
  manifestHash: string;
  approvedBy: string;
  approverRole: string;
  approvedAt: string;
  comment?: string | undefined;
  status: string;
  invalidatedAt?: string | undefined;
  invalidatedReason?: string | undefined;
};

export function toFinalApprovalSummary(approval: FinalApproval): FinalApprovalSummary {
  return {
    id: approval.id,
    tenderId: approval.tenderId,
    exportJobId: approval.exportJobId,
    validationRunId: approval.validationRunId,
    manifestHash: approval.manifestHash,
    approvedBy: approval.approvedBy,
    approverRole: approval.approverRole,
    approvedAt: approval.approvedAt.toISOString(),
    comment: approval.comment,
    status: approval.status,
    invalidatedAt: approval.invalidatedAt?.toISOString(),
    invalidatedReason: approval.invalidatedReason,
  };
}
