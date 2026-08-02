import { describe, expect, it } from "vitest";
import { computeRunReadiness, ValidationRun } from "./validation-run.aggregate";
import { ValidationIssue } from "./validation-issue";
import { ValidationSeverity } from "./validation-severity";
import { ReadinessStatus } from "./readiness-status";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function issue(overrides: Partial<Parameters<typeof ValidationIssue.create>[0]> = {}) {
  return ValidationIssue.create({
    id: "issue-1",
    organizationId: "org-1",
    validationRunId: "run-1",
    ruleCode: "MISSING_SECTION",
    severity: ValidationSeverity.Blocking,
    message: "missing",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("computeRunReadiness", () => {
  it("returns READY_FOR_APPROVAL when there are no issues", () => {
    expect(computeRunReadiness([])).toBe(ReadinessStatus.ReadyForApproval);
  });

  it("returns BLOCKED when at least one blocking issue is open", () => {
    expect(computeRunReadiness([issue({ severity: ValidationSeverity.Blocking })])).toBe(ReadinessStatus.Blocked);
  });

  it("returns READY_WITH_WARNINGS when only non-blocking issues remain open", () => {
    expect(computeRunReadiness([issue({ severity: ValidationSeverity.Warning })])).toBe(ReadinessStatus.ReadyWithWarnings);
  });

  it("returns READY_FOR_APPROVAL once a blocking issue is resolved", () => {
    const blocking = issue({ severity: ValidationSeverity.Blocking });
    blocking.resolve({ resolvedBy: "user-1", resolutionNote: "fixed", occurredAt: NOW });
    expect(computeRunReadiness([blocking])).toBe(ReadinessStatus.ReadyForApproval);
  });
});

describe("ValidationRun", () => {
  it("freezes readinessStatus at creation time, from the issues passed in", () => {
    const run = ValidationRun.create({
      id: "run-1",
      organizationId: "org-1",
      clientAccountId: "client-1",
      tenderId: "tender-1",
      exportJobId: "job-1",
      runBy: "user-1",
      occurredAt: NOW,
      issues: [issue()],
    });
    expect(run.readinessStatus).toBe(ReadinessStatus.Blocked);
  });
});

describe("ValidationIssue", () => {
  it("requires a resolution note to resolve", () => {
    expect(() => issue().resolve({ resolvedBy: "user-1", resolutionNote: "", occurredAt: NOW })).toThrow();
  });

  it("OPEN -> RESOLVED -> REOPENED -> RESOLVED is allowed, preserving author/date/note each time", () => {
    const i = issue();
    i.resolve({ resolvedBy: "user-1", resolutionNote: "fixed", occurredAt: NOW });
    expect(i.isOpen).toBe(false);
    i.reopen({ resolvedBy: "user-2", resolutionNote: "actually not fixed", occurredAt: NOW });
    expect(i.isOpen).toBe(true);
    expect(i.resolvedBy).toBe("user-2");
    i.resolve({ resolvedBy: "user-1", resolutionNote: "fixed for real", occurredAt: NOW });
    expect(i.isOpen).toBe(false);
  });

  it("rejects resolving an already-resolved issue directly again (must reopen first)", () => {
    const i = issue();
    i.resolve({ resolvedBy: "user-1", resolutionNote: "fixed", occurredAt: NOW });
    expect(() => i.resolve({ resolvedBy: "user-1", resolutionNote: "again", occurredAt: NOW })).toThrow();
  });
});
