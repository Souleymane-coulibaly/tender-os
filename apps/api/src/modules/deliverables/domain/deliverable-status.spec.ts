import { describe, expect, it } from "vitest";
import { deriveDeliverableStatus, DeliverableStatus } from "./deliverable-status";
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
