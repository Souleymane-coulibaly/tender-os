import { describe, expect, it } from "vitest";
import { ApprovalEntityType, ApprovalRequest, ApprovalStatus } from "./approval-request.entity";
import { ApprovalRejectionReasonRequiredError, ApprovalRequestAlreadyReviewedError } from "./errors";

describe("ApprovalRequest", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  function create(): ApprovalRequest {
    return ApprovalRequest.create({
      id: "approval-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      entityType: ApprovalEntityType.Task,
      entityId: "task-1",
      requestedBy: "user-1",
      reviewerId: "user-2",
      occurredAt,
    });
  }

  it("starts PENDING", () => {
    const approval = create();

    expect(approval.status).toBe(ApprovalStatus.Pending);
    expect(approval.reviewedAt).toBeUndefined();
  });

  it("approve() transitions to APPROVED and stamps reviewedAt", () => {
    const approval = create();
    const reviewedAt = new Date("2026-01-02T00:00:00.000Z");

    approval.approve("Conforme.", reviewedAt);

    expect(approval.status).toBe(ApprovalStatus.Approved);
    expect(approval.comment).toBe("Conforme.");
    expect(approval.reviewedAt).toBe(reviewedAt);
  });

  it("requestChanges() transitions to CHANGES_REQUESTED, never REJECTED", () => {
    const approval = create();

    approval.requestChanges("Il manque une signature.", new Date());

    expect(approval.status).toBe(ApprovalStatus.ChangesRequested);
    expect(approval.comment).toBe("Il manque une signature.");
  });

  it("rejects a second review once already APPROVED (double-approval protection, mission §48)", () => {
    const approval = create();
    approval.approve(undefined, new Date("2026-01-02T00:00:00.000Z"));

    expect(() => approval.approve(undefined, new Date("2026-01-03T00:00:00.000Z"))).toThrow(ApprovalRequestAlreadyReviewedError);
    expect(() => approval.requestChanges(undefined, new Date())).toThrow(ApprovalRequestAlreadyReviewedError);
  });

  it("cancel() is only valid while PENDING", () => {
    const approval = create();
    approval.cancel(new Date("2026-01-02T00:00:00.000Z"));

    expect(approval.status).toBe(ApprovalStatus.Cancelled);
    expect(() => approval.approve(undefined, new Date())).toThrow(ApprovalRequestAlreadyReviewedError);
  });

  it("BLOQUANT — mission §27/§34: reject() transitions to REJECTED, distinct from CHANGES_REQUESTED, and requires a non-empty reason", () => {
    const approval = create();
    const reviewedAt = new Date("2026-01-02T00:00:00.000Z");

    approval.reject("Ne respecte pas le CCTP.", reviewedAt);

    expect(approval.status).toBe(ApprovalStatus.Rejected);
    expect(approval.status).not.toBe(ApprovalStatus.ChangesRequested);
    expect(approval.comment).toBe("Ne respecte pas le CCTP.");
    expect(approval.reviewedAt).toBe(reviewedAt);
  });

  it("reject() throws ApprovalRejectionReasonRequiredError on an empty/whitespace-only reason", () => {
    const approval = create();

    expect(() => approval.reject("", new Date())).toThrow(ApprovalRejectionReasonRequiredError);
    expect(() => approval.reject("   ", new Date())).toThrow(ApprovalRejectionReasonRequiredError);
  });

  it("reject() after an already-decided request throws ApprovalRequestAlreadyReviewedError (mission §48 applies to REJECTED too)", () => {
    const approval = create();
    approval.approve(undefined, new Date("2026-01-02T00:00:00.000Z"));

    expect(() => approval.reject("Trop tard.", new Date())).toThrow(ApprovalRequestAlreadyReviewedError);
  });

  it("supports the three new V2 Sprint 18 entity types (TECHNICAL_MEMO_SECTION_REVISION/PRICING_SCHEDULE_VERSION/RESPONSE_PACKAGE_VERSION)", () => {
    for (const entityType of [ApprovalEntityType.TechnicalMemoSectionRevision, ApprovalEntityType.PricingScheduleVersion, ApprovalEntityType.ResponsePackageVersion]) {
      const approval = ApprovalRequest.create({
        id: "approval-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        entityType,
        entityId: "target-1",
        requestedBy: "user-1",
        reviewerId: "user-2",
        occurredAt,
      });
      expect(approval.entityType).toBe(entityType);
      expect(approval.status).toBe(ApprovalStatus.Pending);
    }
  });

  it("keeps the original comment when the review omits one", () => {
    const approval = ApprovalRequest.create({
      id: "approval-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      entityType: ApprovalEntityType.ChecklistItem,
      entityId: "item-1",
      requestedBy: "user-1",
      reviewerId: "user-2",
      comment: "Merci de vérifier la RC.",
      occurredAt,
    });

    approval.approve(undefined, new Date());

    expect(approval.comment).toBe("Merci de vérifier la RC.");
  });
});
