import { describe, expect, it } from "vitest";
import { DceDocument } from "./dce-document.entity";
import { DceDocumentCategory } from "./dce-document-category";
import { DceDocumentProcessingStatus } from "./dce-document-processing-status";

function createLink(): DceDocument {
  return DceDocument.create({
    dceId: "dce-1",
    documentId: "document-1",
    organizationId: "org-1",
    createdByUserId: "user-1",
    category: DceDocumentCategory.Technical,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("DceDocument.create", () => {
  it("starts IMPORTED, carrying the computed category", () => {
    const link = createLink();

    expect(link.category).toBe(DceDocumentCategory.Technical);
    expect(link.processingStatus).toBe(DceDocumentProcessingStatus.Imported);
    expect(link.updatedAt).toEqual(link.createdAt);
  });
});

describe("DceDocument#transitionProcessingStatus", () => {
  it("transitions to the given status and bumps updatedAt", () => {
    const link = createLink();

    link.transitionProcessingStatus(DceDocumentProcessingStatus.ReadyForOcr, new Date("2026-01-02T00:00:00Z"));

    expect(link.processingStatus).toBe(DceDocumentProcessingStatus.ReadyForOcr);
    expect(link.updatedAt).toEqual(new Date("2026-01-02T00:00:00Z"));
  });

  it("is idempotent: calling it again with the same status does not move updatedAt", () => {
    const link = createLink();

    link.transitionProcessingStatus(DceDocumentProcessingStatus.ReadyForOcr, new Date("2026-01-02T00:00:00Z"));
    link.transitionProcessingStatus(DceDocumentProcessingStatus.ReadyForOcr, new Date("2026-01-03T00:00:00Z"));

    expect(link.processingStatus).toBe(DceDocumentProcessingStatus.ReadyForOcr);
    expect(link.updatedAt).toEqual(new Date("2026-01-02T00:00:00Z"));
  });

  it("moves updatedAt when transitioning to a genuinely different status", () => {
    const link = createLink();

    link.transitionProcessingStatus(DceDocumentProcessingStatus.PendingTextInspection, new Date("2026-01-02T00:00:00Z"));
    link.transitionProcessingStatus(DceDocumentProcessingStatus.ReadyForNativeExtraction, new Date("2026-01-03T00:00:00Z"));

    expect(link.processingStatus).toBe(DceDocumentProcessingStatus.ReadyForNativeExtraction);
    expect(link.updatedAt).toEqual(new Date("2026-01-03T00:00:00Z"));
  });
});

describe("DceDocument.rehydrate", () => {
  it("restores persisted props without altering them", () => {
    const props = {
      dceId: "dce-1",
      documentId: "document-1",
      organizationId: "org-1",
      createdByUserId: "user-1",
      category: DceDocumentCategory.Financial,
      processingStatus: DceDocumentProcessingStatus.ReadyForOcr,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    const link = DceDocument.rehydrate(props);

    expect(link.category).toBe(DceDocumentCategory.Financial);
    expect(link.processingStatus).toBe(DceDocumentProcessingStatus.ReadyForOcr);
  });
});
