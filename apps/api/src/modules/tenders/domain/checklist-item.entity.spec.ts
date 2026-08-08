import { describe, expect, it } from "vitest";
import {
  ChecklistComplianceStatus,
  ChecklistDocumentMatchStatus,
  ChecklistDocumentStatus,
  ChecklistItem,
  ChecklistItemOrigin,
  ChecklistItemStatus,
} from "./checklist-item.entity";

function createItem(overrides: Partial<Parameters<typeof ChecklistItem.create>[0]> = {}): ChecklistItem {
  return ChecklistItem.create({
    id: "item-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    title: "Fournir l'attestation",
    required: true,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("ChecklistItem#changeStatus", () => {
  it("records completedAt/completedBy when marked COMPLETED", () => {
    const item = createItem();

    item.changeStatus(ChecklistItemStatus.Completed, "user-1", new Date("2026-02-01T00:00:00Z"));

    expect(item.completedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(item.completedBy).toBe("user-1");
  });

  it("clears completedAt/completedBy when moved back to a non-completed status", () => {
    const item = createItem();
    item.changeStatus(ChecklistItemStatus.Completed, "user-1", new Date());

    item.changeStatus(ChecklistItemStatus.InProgress, undefined, new Date());

    expect(item.completedAt).toBeUndefined();
    expect(item.completedBy).toBeUndefined();
  });
});

/** V2 Sprint 6 — `deriveLegacyStatus` doit garder `readiness-calculator.ts` (35% du score readiness)
 *  fonctionnel : seul VALIDATED/NOT_APPLICABLE compte comme "terminé", jamais un simple document
 *  rapproché (READY) non validé par un humain. */
describe("ChecklistItem#validate / markNotApplicable (V2 Sprint 6)", () => {
  it("validate() sets complianceStatus=VALIDATED, derives legacy status=COMPLETED, and records completedAt/completedBy", () => {
    const item = createItem();

    item.validate("user-1", new Date("2026-02-01T00:00:00Z"));

    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.Validated);
    expect(item.status).toBe(ChecklistItemStatus.Completed);
    expect(item.completedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(item.completedBy).toBe("user-1");
  });

  it("markNotApplicable() sets complianceStatus=NOT_APPLICABLE, derives legacy status=NOT_APPLICABLE, never sets completedAt", () => {
    const item = createItem();

    item.markNotApplicable("user-1", new Date());

    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.NotApplicable);
    expect(item.status).toBe(ChecklistItemStatus.NotApplicable);
    expect(item.completedAt).toBeUndefined();
  });

  it("a freshly-created MANUAL item with no progress signal derives legacy status=TODO", () => {
    const item = createItem();
    expect(item.status).toBe(ChecklistItemStatus.Todo);
  });

  it("an AI-sourced item (origin=AI_SUGGESTION) with no assignee and no matched document still derives IN_PROGRESS, never TODO, once its lifecycle re-evaluates status (e.g. after a detach)", () => {
    const item = createItem({ origin: ChecklistItemOrigin.AiSuggestion });
    item.attachDocument({ documentId: "doc-1", matchStatus: ChecklistDocumentMatchStatus.ManuallyAttached }, new Date());

    item.detachDocument(new Date());

    expect(item.status).toBe(ChecklistItemStatus.InProgress);
  });
});

describe("ChecklistItem#attachDocument / detachDocument (V2 Sprint 6 §16-18)", () => {
  it("attaching a document with no expiration sets documentStatus=AVAILABLE and complianceStatus=READY, never VALIDATED directly", () => {
    const item = createItem();

    item.attachDocument(
      { documentId: "doc-1", matchStatus: ChecklistDocumentMatchStatus.ManuallyAttached },
      new Date("2026-02-01T00:00:00Z"),
    );

    expect(item.documentStatus).toBe(ChecklistDocumentStatus.Available);
    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.Ready);
    expect(item.matchedDocumentId).toBe("doc-1");
  });

  it("attaching an already-expired document sets documentStatus=EXPIRED and complianceStatus=NON_COMPLIANT, never inventing a missing expiration", () => {
    const item = createItem();
    const now = new Date("2026-02-01T00:00:00Z");

    item.attachDocument(
      { documentId: "doc-1", matchStatus: ChecklistDocumentMatchStatus.ManuallyAttached, expiresAt: new Date("2026-01-01T00:00:00Z") },
      now,
    );

    expect(item.documentStatus).toBe(ChecklistDocumentStatus.Expired);
    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.NonCompliant);
  });

  it("attaching a document never overrides an already-VALIDATED item's complianceStatus", () => {
    const item = createItem();
    item.validate("user-1", new Date());

    item.attachDocument({ documentId: "doc-1", matchStatus: ChecklistDocumentMatchStatus.ManuallyAttached }, new Date());

    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.Validated);
  });

  it("detachDocument resets document fields to MISSING/NOT_SEARCHED and reverts a non-NOT_APPLICABLE item to TO_REVIEW", () => {
    const item = createItem();
    item.attachDocument({ documentId: "doc-1", matchStatus: ChecklistDocumentMatchStatus.ManuallyAttached }, new Date());

    item.detachDocument(new Date());

    expect(item.matchedDocumentId).toBeUndefined();
    expect(item.documentStatus).toBe(ChecklistDocumentStatus.Missing);
    expect(item.documentMatchStatus).toBe(ChecklistDocumentMatchStatus.NotSearched);
    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.ToReview);
  });

  it("detachDocument never pulls a NOT_APPLICABLE item back to TO_REVIEW", () => {
    const item = createItem();
    item.markNotApplicable("user-1", new Date());

    item.detachDocument(new Date());

    expect(item.complianceStatus).toBe(ChecklistComplianceStatus.NotApplicable);
  });
});
