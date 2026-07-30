import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KnowledgeDocumentNotReprocessableError } from "./errors";
import { KnowledgeDocument } from "./knowledge-document.entity";
import { KnowledgeDocumentStatus } from "./knowledge-document-status";

const NOW = new Date("2026-07-30T10:00:00Z");
const LATER = new Date("2026-07-30T11:00:00Z");

function createDocument(): KnowledgeDocument {
  return KnowledgeDocument.create({
    id: randomUUID(),
    organizationId: randomUUID(),
    knowledgeEntryId: randomUUID(),
    documentId: randomUUID(),
    versionNumber: 1,
    occurredAt: NOW,
  });
}

describe("KnowledgeDocument", () => {
  it("starts PENDING with attemptCount 0", () => {
    const document = createDocument();
    expect(document.status).toBe(KnowledgeDocumentStatus.Pending);
    expect(document.attemptCount).toBe(0);
  });

  it("reserve() transitions PENDING -> PROCESSING and increments attemptCount", () => {
    const document = createDocument();
    document.reserve(LATER);
    expect(document.status).toBe(KnowledgeDocumentStatus.Processing);
    expect(document.attemptCount).toBe(1);
  });

  it("complete() records language/warnings and clears any prior error", () => {
    const document = createDocument();
    document.reserve(NOW);
    document.fail({ errorMessage: "boom" }, NOW);
    document.reserve(LATER);
    document.complete({ outcome: KnowledgeDocumentStatus.Ready, language: "fr", warnings: [] }, LATER);
    expect(document.status).toBe(KnowledgeDocumentStatus.Ready);
    expect(document.language).toBe("fr");
    expect(document.errorMessage).toBeUndefined();
  });

  it("fail() records the error and leaves the document reprocessable", () => {
    const document = createDocument();
    document.reserve(NOW);
    document.fail({ errorMessage: "extraction produced no usable text content" }, LATER);
    expect(document.status).toBe(KnowledgeDocumentStatus.Failed);
    expect(document.errorMessage).toBe("extraction produced no usable text content");
    expect(() => document.assertReprocessable()).not.toThrow();
  });

  it("refuses to reserve a document that is already PROCESSING", () => {
    const document = createDocument();
    document.reserve(NOW);
    expect(() => document.reserve(LATER)).toThrow(KnowledgeDocumentNotReprocessableError);
  });

  it("assertReprocessable rejects a PROCESSING document", () => {
    const document = createDocument();
    document.reserve(NOW);
    expect(() => document.assertReprocessable()).toThrow(KnowledgeDocumentNotReprocessableError);
  });
});
