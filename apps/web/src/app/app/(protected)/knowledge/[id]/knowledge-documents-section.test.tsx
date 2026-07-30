import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDocumentsSection } from "./knowledge-documents-section";
import type { KnowledgeChunkSummary, KnowledgeDocumentSummary } from "../../../../../lib/knowledge-types";

const fetchKnowledgeDocumentDetail = vi.fn(async (_entryId: string, _documentId: string) => ({
  chunks: [{ id: "chunk-1", knowledgeDocumentId: "doc-1", sequence: 0, content: "Contenu extrait.", characterCount: 17, checksum: "abcdef0123456789", createdAt: "2026-01-01T00:00:00.000Z" }] as KnowledgeChunkSummary[],
}));
const reprocessKnowledgeDocumentAction = vi.fn(async (_entryId: string, _documentId: string) => ({}));

vi.mock("../../../knowledge-actions", () => ({
  fetchKnowledgeDocumentDetail: (entryId: string, documentId: string) => fetchKnowledgeDocumentDetail(entryId, documentId),
  reprocessKnowledgeDocumentAction: (entryId: string, documentId: string) => reprocessKnowledgeDocumentAction(entryId, documentId),
}));

const readyDocument: KnowledgeDocumentSummary = {
  id: "doc-1",
  organizationId: "org-1",
  knowledgeEntryId: "entry-1",
  documentId: "raw-doc-1",
  versionNumber: 1,
  status: "READY",
  warnings: [],
  attemptCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const failedDocument: KnowledgeDocumentSummary = { ...readyDocument, id: "doc-2", status: "FAILED", errorMessage: "extraction produced no usable text content" };

describe("KnowledgeDocumentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when there are no documents", () => {
    render(<KnowledgeDocumentsSection entryId="entry-1" initialDocuments={[]} canManage={true} />);
    expect(screen.getByText("Aucun document associé.")).toBeInTheDocument();
  });

  it("loads and displays chunks on demand when a document is expanded", async () => {
    const user = userEvent.setup();
    render(<KnowledgeDocumentsSection entryId="entry-1" initialDocuments={[readyDocument]} canManage={true} />);

    expect(fetchKnowledgeDocumentDetail).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Version v1/ }));

    expect(fetchKnowledgeDocumentDetail).toHaveBeenCalledWith("entry-1", "doc-1");
    expect(await screen.findByText("Contenu extrait.")).toBeInTheDocument();
  });

  it("shows the error message and a retry action for a FAILED document, never a raw stacktrace", async () => {
    const user = userEvent.setup();
    render(<KnowledgeDocumentsSection entryId="entry-1" initialDocuments={[failedDocument]} canManage={true} />);

    expect(screen.getByText("extraction produced no usable text content")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Relancer le traitement" }));

    expect(reprocessKnowledgeDocumentAction).toHaveBeenCalledWith("entry-1", "doc-2");
  });

  it("never offers a reprocess action for a READY document", () => {
    render(<KnowledgeDocumentsSection entryId="entry-1" initialDocuments={[readyDocument]} canManage={true} />);
    expect(screen.queryByRole("button", { name: "Relancer le traitement" })).not.toBeInTheDocument();
  });
});
