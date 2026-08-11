import { describe, expect, it } from "vitest";
import { deriveAttentionReasons } from "./derive-attention-reasons";
import { AttentionReason, DeadlineBucket } from "../enums";
import { ReadinessStatus } from "../../../tenders";
import { ResponsePackageStatus } from "../../../response-package";

describe("deriveAttentionReasons", () => {
  it("returns no reasons for a healthy tender with no deadline and no package", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] }),
    ).toEqual([]);
  });

  it("flags an overdue deadline", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: DeadlineBucket.Overdue, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] }),
    ).toContain(AttentionReason.DeadlineOverdue);
  });

  it("flags an urgent deadline (today/tomorrow) distinctly from overdue", () => {
    const todayReasons = deriveAttentionReasons({ deadlineBucket: DeadlineBucket.Today, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] });
    expect(todayReasons).toContain(AttentionReason.DeadlineUrgent);
    expect(todayReasons).not.toContain(AttentionReason.DeadlineOverdue);
  });

  it("does not flag a deadline that is merely THIS_WEEK or LATER", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: DeadlineBucket.ThisWeek, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] }),
    ).toEqual([]);
  });

  it("flags an incomplete REQUIRED checklist", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 3, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] }),
    ).toContain(AttentionReason.ChecklistIncomplete);
  });

  it("does NOT flag a tender with zero packages created (no response package yet is not itself an attention signal)", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [] }),
    ).not.toContain(AttentionReason.PackageNotReady);
  });

  it("flags a DRAFT/IN_REVIEW/INVALIDATED package as not ready", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [ResponsePackageStatus.Draft] }),
    ).toContain(AttentionReason.PackageNotReady);
  });

  it("does NOT flag a READY/VALIDATED/EXPORTED package", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.Ready, packageStatuses: [ResponsePackageStatus.Validated] }),
    ).not.toContain(AttentionReason.PackageNotReady);
  });

  it("BLOQUANT — a multi-lot tender with one blocked lot is flagged even if another lot is ready (never masked by aggregation, mission §36/§97)", () => {
    const reasons = deriveAttentionReasons({
      deadlineBucket: undefined,
      incompleteChecklistCount: 0,
      readinessStatus: ReadinessStatus.Ready,
      packageStatuses: [ResponsePackageStatus.Validated, ResponsePackageStatus.Draft],
    });
    expect(reasons).toContain(AttentionReason.PackageNotReady);
  });

  it("flags NOT_READY readiness status", () => {
    expect(
      deriveAttentionReasons({ deadlineBucket: undefined, incompleteChecklistCount: 0, readinessStatus: ReadinessStatus.NotReady, packageStatuses: [] }),
    ).toContain(AttentionReason.ReadinessAtRisk);
  });

  it("combines multiple simultaneous reasons", () => {
    const reasons = deriveAttentionReasons({
      deadlineBucket: DeadlineBucket.Overdue,
      incompleteChecklistCount: 2,
      readinessStatus: ReadinessStatus.NotReady,
      packageStatuses: [ResponsePackageStatus.Draft],
    });
    expect(reasons).toEqual(
      expect.arrayContaining([AttentionReason.DeadlineOverdue, AttentionReason.ChecklistIncomplete, AttentionReason.PackageNotReady, AttentionReason.ReadinessAtRisk]),
    );
  });
});
