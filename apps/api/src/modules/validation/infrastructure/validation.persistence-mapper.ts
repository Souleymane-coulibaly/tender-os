import { FinalApproval, type FinalApprovalStatus } from "../domain/final-approval.aggregate";
import type { PersistableValidationReadinessStatus } from "../domain/readiness-status";
import { ValidationIssue, type ValidationResolutionStatus } from "../domain/validation-issue";
import type { ValidationSeverity } from "../domain/validation-severity";
import { ValidationRun } from "../domain/validation-run.aggregate";

export type PersistedValidationIssue = {
  id: string;
  organizationId: string;
  validationRunId: string;
  ruleCode: string;
  severity: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  source: string | null;
  recommendation: string | null;
  detectedAt: Date;
  resolutionStatus: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

export type PersistedValidationRun = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportJobId: string;
  readinessStatus: string;
  runBy: string;
  runAt: Date;
  issues: readonly PersistedValidationIssue[];
};

export type PersistedFinalApproval = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportJobId: string;
  validationRunId: string;
  manifestHash: string;
  approvedBy: string;
  approverRole: string;
  approvedAt: Date;
  comment: string | null;
  previousStatus: string | null;
  nextStatus: string | null;
  status: string;
  invalidatedAt: Date | null;
  invalidatedReason: string | null;
};

export function toDomainIssue(record: PersistedValidationIssue): ValidationIssue {
  return ValidationIssue.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    validationRunId: record.validationRunId,
    ruleCode: record.ruleCode,
    severity: record.severity as ValidationSeverity,
    message: record.message,
    resourceType: record.resourceType ?? undefined,
    resourceId: record.resourceId ?? undefined,
    source: record.source ?? undefined,
    recommendation: record.recommendation ?? undefined,
    detectedAt: record.detectedAt,
    resolutionStatus: record.resolutionStatus as ValidationResolutionStatus,
    resolvedAt: record.resolvedAt ?? undefined,
    resolvedBy: record.resolvedBy ?? undefined,
    resolutionNote: record.resolutionNote ?? undefined,
  });
}

export function toDomainRun(record: PersistedValidationRun): ValidationRun {
  return ValidationRun.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    exportJobId: record.exportJobId,
    readinessStatus: record.readinessStatus as PersistableValidationReadinessStatus,
    runBy: record.runBy,
    runAt: record.runAt,
    issues: record.issues.map(toDomainIssue),
  });
}

export function toDomainApproval(record: PersistedFinalApproval): FinalApproval {
  return FinalApproval.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    exportJobId: record.exportJobId,
    validationRunId: record.validationRunId,
    manifestHash: record.manifestHash,
    approvedBy: record.approvedBy,
    approverRole: record.approverRole,
    approvedAt: record.approvedAt,
    comment: record.comment ?? undefined,
    previousStatus: record.previousStatus ?? undefined,
    nextStatus: record.nextStatus ?? undefined,
    status: record.status as FinalApprovalStatus,
    invalidatedAt: record.invalidatedAt ?? undefined,
    invalidatedReason: record.invalidatedReason ?? undefined,
  });
}
