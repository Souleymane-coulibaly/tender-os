import { describe, expect, it } from "vitest";
import { deriveDeliverableSectionStatus, DeliverableSectionStatus } from "./deliverable-section-status";
import { DeliverableRevisionStatus } from "./deliverable-revision-status";

describe("deriveDeliverableSectionStatus", () => {
  it("returns NOT_STARTED when there is no revision yet", () => {
    expect(deriveDeliverableSectionStatus(undefined)).toBe(DeliverableSectionStatus.NotStarted);
  });

  it("returns DRAFT for a fresh DRAFT revision never edited (editVersion 0)", () => {
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.Draft, editVersion: 0 })).toBe(DeliverableSectionStatus.Draft);
  });

  it("returns IN_PROGRESS for a DRAFT revision that has been edited at least once", () => {
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.Draft, editVersion: 3 })).toBe(DeliverableSectionStatus.InProgress);
  });

  it("maps READY_FOR_REVIEW, CHANGES_REQUESTED/REJECTED, and VALIDATED directly", () => {
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.ReadyForReview, editVersion: 1 })).toBe(DeliverableSectionStatus.ReadyForReview);
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.ChangesRequested, editVersion: 1 })).toBe(DeliverableSectionStatus.ChangesRequested);
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.Rejected, editVersion: 1 })).toBe(DeliverableSectionStatus.ChangesRequested);
    expect(deriveDeliverableSectionStatus({ status: DeliverableRevisionStatus.Validated, editVersion: 1 })).toBe(DeliverableSectionStatus.Validated);
  });
});
