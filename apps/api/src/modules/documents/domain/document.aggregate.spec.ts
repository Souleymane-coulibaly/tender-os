import { describe, expect, it } from "vitest";
import { DocumentArchivedError, DocumentDeletedError, DocumentNotArchivedError } from "./errors";
import { DocumentDomain } from "./document-domain";
import { DocumentId } from "./document-id.value-object";
import { DocumentOrigin } from "./document-origin";
import { DocumentStatus } from "./document-status";
import { Document } from "./document.aggregate";

const NOW = new Date("2026-07-27T00:00:00Z");

function createDocument(): Document {
  return Document.create({
    id: DocumentId.from("doc-1"),
    organizationId: "org-1",
    title: "Attestation fiscale",
    origin: DocumentOrigin.UserUpload,
    domain: DocumentDomain.Organization,
    createdByUserId: "user-1",
    occurredAt: NOW,
  });
}

describe("Document aggregate", () => {
  it("starts ACTIVE, without a current version", () => {
    const document = createDocument();

    expect(document.status).toBe(DocumentStatus.Active);
    expect(document.currentVersionId).toBeUndefined();
    expect(document.currentVersionNumber).toBe(0);
  });

  it("promotes a version and bumps currentVersionNumber/updatedAt", () => {
    const document = createDocument();
    const later = new Date("2026-07-28T00:00:00Z");

    document.promoteVersion({ versionId: "version-1", versionNumber: 1, occurredAt: later });

    expect(document.currentVersionId).toBe("version-1");
    expect(document.currentVersionNumber).toBe(1);
    expect(document.updatedAt).toBe(later);
  });

  it("updates metadata and records the actor", () => {
    const document = createDocument();

    document.updateMetadata({ title: "Attestation fiscale 2026", category: "ATTESTATION_FISCALE" }, "user-2", NOW);

    expect(document.title).toBe("Attestation fiscale 2026");
    expect(document.category).toBe("ATTESTATION_FISCALE");
    expect(document.updatedByUserId).toBe("user-2");
  });

  it("archives, stamping archivedAt, and refuses further mutation", () => {
    const document = createDocument();

    document.archive(NOW);

    expect(document.status).toBe(DocumentStatus.Archived);
    expect(document.archivedAt).toBe(NOW);
    expect(() => document.updateMetadata({ title: "x" }, "user-1", NOW)).toThrow(DocumentArchivedError);
    expect(() => document.promoteVersion({ versionId: "v2", versionNumber: 2, occurredAt: NOW })).toThrow(
      DocumentArchivedError,
    );
    expect(() => document.archive(NOW)).toThrow(DocumentArchivedError);
  });

  it("restores an archived document back to ACTIVE", () => {
    const document = createDocument();
    document.archive(NOW);

    document.restore(NOW);

    expect(document.status).toBe(DocumentStatus.Active);
    expect(document.archivedAt).toBeUndefined();
  });

  it("refuses to restore a document that is not archived", () => {
    const document = createDocument();

    expect(() => document.restore(NOW)).toThrow(DocumentNotArchivedError);
  });

  it("soft-deletes and refuses any further mutation, including a second delete", () => {
    const document = createDocument();

    document.softDelete(NOW);

    expect(document.deletedAt).toBe(NOW);
    expect(() => document.updateMetadata({ title: "x" }, "user-1", NOW)).toThrow(DocumentDeletedError);
    expect(() => document.archive(NOW)).toThrow(DocumentDeletedError);
    expect(() => document.softDelete(NOW)).toThrow(DocumentDeletedError);
  });
});
