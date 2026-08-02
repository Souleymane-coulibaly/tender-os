import { describe, expect, it } from "vitest";
import { FinalApproval } from "./final-approval.aggregate";
import { ValidationIssue } from "./validation-issue";
import { ValidationSeverity } from "./validation-severity";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function baseInput(issues: ValidationIssue[] = []) {
  return {
    id: "approval-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    exportJobId: "job-1",
    validationRunId: "run-1",
    manifestHash: "a".repeat(64),
    approvedBy: "user-1",
    approverRole: "OWNER",
    occurredAt: NOW,
    currentIssues: issues,
  };
}

describe("FinalApproval", () => {
  it("refuses approval when a blocking issue is still open", () => {
    const blocking = ValidationIssue.create({
      id: "issue-1",
      organizationId: "org-1",
      validationRunId: "run-1",
      ruleCode: "MISSING_SECTION",
      severity: ValidationSeverity.Blocking,
      message: "missing",
      occurredAt: NOW,
    });
    expect(() => FinalApproval.create(baseInput([blocking]))).toThrow();
  });

  it("allows approval once the blocking issue has been resolved", () => {
    const blocking = ValidationIssue.create({
      id: "issue-1",
      organizationId: "org-1",
      validationRunId: "run-1",
      ruleCode: "MISSING_SECTION",
      severity: ValidationSeverity.Blocking,
      message: "missing",
      occurredAt: NOW,
    });
    blocking.resolve({ resolvedBy: "user-1", resolutionNote: "fixed", occurredAt: NOW });
    const approval = FinalApproval.create(baseInput([blocking]));
    expect(approval.isActive).toBe(true);
  });

  it("allows approval with only non-blocking (warning) issues open", () => {
    const warning = ValidationIssue.create({
      id: "issue-1",
      organizationId: "org-1",
      validationRunId: "run-1",
      ruleCode: "SHORT_CONTENT",
      severity: ValidationSeverity.Warning,
      message: "short",
      occurredAt: NOW,
    });
    expect(() => FinalApproval.create(baseInput([warning]))).not.toThrow();
  });

  it("invalidate() can only happen once — a second invalidation is refused", () => {
    const approval = FinalApproval.create(baseInput());
    approval.invalidate({ reason: "content changed", occurredAt: NOW });
    expect(approval.isActive).toBe(false);
    expect(() => approval.invalidate({ reason: "again", occurredAt: NOW })).toThrow();
  });
});
