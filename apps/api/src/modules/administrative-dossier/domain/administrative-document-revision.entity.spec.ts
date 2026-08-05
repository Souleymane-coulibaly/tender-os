import { describe, expect, it } from "vitest";
import { AdministrativeDocumentRevision } from "./administrative-document-revision.entity";
import { AdministrativeDocumentRevisionStatus } from "./administrative-document-revision-status";
import { ImmutableAdministrativeDocumentRevisionError } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseInput() {
  return { id: "rev-1", organizationId: "org-1", administrativeDocumentId: "doc-1", revisionNumber: 1, createdBy: "user-1", occurredAt: NOW };
}

describe("AdministrativeDocumentRevision — mission §21", () => {
  it("starts DRAFT with no attached file", () => {
    const revision = AdministrativeDocumentRevision.create(baseInput());
    expect(revision.status).toBe(AdministrativeDocumentRevisionStatus.Draft);
    expect(revision.hasAttachedFile).toBe(false);
  });

  it("attachDocument sets the file reference and hasAttachedFile becomes true", () => {
    const revision = AdministrativeDocumentRevision.create(baseInput());
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    expect(revision.hasAttachedFile).toBe(true);
    expect(revision.documentChecksum).toBe("abc");
  });

  it("refuses to attach a document to a non-DRAFT revision — an old revision is never overwritten", () => {
    const revision = AdministrativeDocumentRevision.create(baseInput());
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    revision.submitForReview(NOW);
    revision.validate(NOW);
    expect(() =>
      revision.attachDocument({ documentId: "doc-ext-2", documentVersionId: "v2", documentChecksum: "def", documentFileName: "g.pdf", documentMimeType: "application/pdf", occurredAt: NOW }),
    ).toThrow(ImmutableAdministrativeDocumentRevisionError);
  });

  it("validate is idempotent when already VALIDATED", () => {
    const revision = AdministrativeDocumentRevision.create(baseInput());
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    revision.submitForReview(NOW);
    revision.validate(NOW);
    expect(() => revision.validate(NOW)).not.toThrow();
    expect(revision.status).toBe(AdministrativeDocumentRevisionStatus.Validated);
  });

  it("markReplaced transitions a VALIDATED revision to REPLACED (superseded by a newer one)", () => {
    const revision = AdministrativeDocumentRevision.create(baseInput());
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    revision.submitForReview(NOW);
    revision.validate(NOW);
    revision.markReplaced(NOW);
    expect(revision.status).toBe(AdministrativeDocumentRevisionStatus.Replaced);
  });
});
