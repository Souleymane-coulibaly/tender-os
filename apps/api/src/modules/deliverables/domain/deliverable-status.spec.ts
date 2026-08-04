import { describe, expect, it } from "vitest";
import {
  deriveAnnexesDeliverableStatus,
  deriveChecklistDeliverableStatus,
  deriveComplianceMatrixDeliverableStatus,
  deriveDeliverableStatus,
  DeliverableStatus,
} from "./deliverable-status";
import { AnnexStatus } from "./annex-status";
import { ChecklistPieceStatus } from "./checklist-piece-status";
import { ComplianceCoverageStatus } from "./compliance-coverage-status";
import { DeliverableSectionStatus } from "./deliverable-section-status";

describe("deriveDeliverableStatus", () => {
  it("returns NOT_STARTED when there are no sections", () => {
    expect(deriveDeliverableStatus({ sectionStatuses: [] })).toBe(DeliverableStatus.NotStarted);
  });

  it("returns VALIDATED only when every section is VALIDATED", () => {
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated, DeliverableSectionStatus.Validated] })).toBe(
      DeliverableStatus.Validated,
    );
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated, DeliverableSectionStatus.Draft] })).not.toBe(
      DeliverableStatus.Validated,
    );
  });

  it("returns CHANGES_REQUESTED as soon as any section requests changes", () => {
    expect(
      deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated, DeliverableSectionStatus.ChangesRequested] }),
    ).toBe(DeliverableStatus.ChangesRequested);
  });

  it("returns READY_FOR_REVIEW when all sections are ready-or-validated with none still in progress", () => {
    expect(
      deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.ReadyForReview, DeliverableSectionStatus.Validated] }),
    ).toBe(DeliverableStatus.ReadyForReview);
  });

  it("BLOCKED always wins regardless of section statuses", () => {
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated], blocked: true })).toBe(DeliverableStatus.Blocked);
  });

  it("EXPORTED wins over APPROVED, which wins over section-derived statuses", () => {
    const approvedAt = new Date();
    const exportedAt = new Date();
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated], approvedAt })).toBe(DeliverableStatus.Approved);
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Validated], approvedAt, exportedAt })).toBe(DeliverableStatus.Exported);
  });

  it("returns IN_PROGRESS once at least one section has started but not everything is DRAFT", () => {
    expect(
      deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.NotStarted, DeliverableSectionStatus.InProgress] }),
    ).toBe(DeliverableStatus.InProgress);
  });

  it("returns DRAFT when the worst section is DRAFT and none request changes", () => {
    expect(deriveDeliverableStatus({ sectionStatuses: [DeliverableSectionStatus.Draft, DeliverableSectionStatus.ReadyForReview] })).toBe(
      DeliverableStatus.Draft,
    );
  });
});

describe("deriveAnnexesDeliverableStatus — mission correctif 'le badge du livrable reste NOT_STARTED indéfiniment'", () => {
  it("returns NOT_STARTED when there are no annexes, or all are still PENDING", () => {
    expect(deriveAnnexesDeliverableStatus([])).toBe(DeliverableStatus.NotStarted);
    expect(deriveAnnexesDeliverableStatus([AnnexStatus.Pending, AnnexStatus.Pending])).toBe(DeliverableStatus.NotStarted);
  });

  it("returns IN_PROGRESS once at least one annex has a document but not all do", () => {
    expect(deriveAnnexesDeliverableStatus([AnnexStatus.Provided, AnnexStatus.Pending])).toBe(DeliverableStatus.InProgress);
  });

  it("returns READY_FOR_REVIEW only when every annex has left PENDING", () => {
    expect(deriveAnnexesDeliverableStatus([AnnexStatus.Provided, AnnexStatus.Validated])).toBe(DeliverableStatus.ReadyForReview);
  });
});

describe("deriveChecklistDeliverableStatus — mission correctif 'le badge du livrable reste NOT_STARTED indéfiniment'", () => {
  it("returns NOT_STARTED when there are no pieces, or all are still MISSING", () => {
    expect(deriveChecklistDeliverableStatus([])).toBe(DeliverableStatus.NotStarted);
    expect(deriveChecklistDeliverableStatus([ChecklistPieceStatus.Missing])).toBe(DeliverableStatus.NotStarted);
  });

  it("returns IN_PROGRESS once at least one piece is provided but not all", () => {
    expect(deriveChecklistDeliverableStatus([ChecklistPieceStatus.Provided, ChecklistPieceStatus.Missing])).toBe(DeliverableStatus.InProgress);
  });

  it("returns READY_FOR_REVIEW only when every piece is PROVIDED or VALID", () => {
    expect(deriveChecklistDeliverableStatus([ChecklistPieceStatus.Provided, ChecklistPieceStatus.Valid])).toBe(DeliverableStatus.ReadyForReview);
  });

  it("returns CHANGES_REQUESTED as soon as any piece is REJECTED or EXPIRED — never treated as merely still missing", () => {
    expect(deriveChecklistDeliverableStatus([ChecklistPieceStatus.Provided, ChecklistPieceStatus.Rejected])).toBe(DeliverableStatus.ChangesRequested);
    expect(deriveChecklistDeliverableStatus([ChecklistPieceStatus.Valid, ChecklistPieceStatus.Expired])).toBe(DeliverableStatus.ChangesRequested);
  });
});

describe("deriveComplianceMatrixDeliverableStatus — mission correctif 'le badge du livrable reste NOT_STARTED indéfiniment'", () => {
  it("returns NOT_STARTED when there are no entries, or all are still TO_CONFIRM (the creation default)", () => {
    expect(deriveComplianceMatrixDeliverableStatus([])).toBe(DeliverableStatus.NotStarted);
    expect(deriveComplianceMatrixDeliverableStatus([ComplianceCoverageStatus.ToConfirm])).toBe(DeliverableStatus.NotStarted);
  });

  it("returns IN_PROGRESS once at least one entry is confirmed but not all", () => {
    expect(deriveComplianceMatrixDeliverableStatus([ComplianceCoverageStatus.Covered, ComplianceCoverageStatus.ToConfirm])).toBe(DeliverableStatus.InProgress);
  });

  it("returns READY_FOR_REVIEW only when every entry has left TO_CONFIRM", () => {
    expect(deriveComplianceMatrixDeliverableStatus([ComplianceCoverageStatus.Covered, ComplianceCoverageStatus.NotApplicable])).toBe(
      DeliverableStatus.ReadyForReview,
    );
  });

  it("returns CHANGES_REQUESTED as soon as any entry is NOT_COVERED — never treated as merely still to confirm", () => {
    expect(deriveComplianceMatrixDeliverableStatus([ComplianceCoverageStatus.Covered, ComplianceCoverageStatus.NotCovered])).toBe(
      DeliverableStatus.ChangesRequested,
    );
  });
});
