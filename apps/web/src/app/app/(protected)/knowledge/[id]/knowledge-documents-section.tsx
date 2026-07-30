"use client";

import { useState } from "react";
import { fetchKnowledgeDocumentDetail, reprocessKnowledgeDocumentAction } from "../../../knowledge-actions";
import {
  KNOWLEDGE_DOCUMENT_STATUS_LABELS,
  formatProvenanceLocation,
  type KnowledgeChunkSummary,
  type KnowledgeDocumentSummary,
} from "../../../../../lib/knowledge-types";

function documentStatusBadgeClass(status: KnowledgeDocumentSummary["status"]): string {
  switch (status) {
    case "READY":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function DocumentChunks({ chunks }: { chunks: KnowledgeChunkSummary[] }) {
  if (chunks.length === 0) {
    return <p className="text-xs text-neutral-500">Aucun contenu extrait.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {chunks.map((chunk) => {
        const location = formatProvenanceLocation(chunk);
        return (
          <li key={chunk.id} className="rounded border border-neutral-100 bg-neutral-50 p-2 text-xs">
            <p className="text-neutral-700">{chunk.content}</p>
            <p className="mt-1 text-neutral-500">
              Chunk #{chunk.sequence}
              {location ? ` — ${location}` : ""} — empreinte {chunk.checksum.slice(0, 12)}…
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function KnowledgeDocumentsSection({
  entryId,
  initialDocuments,
  canManage,
}: {
  entryId: string;
  initialDocuments: KnowledgeDocumentSummary[];
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [chunksByDocumentId, setChunksByDocumentId] = useState<Record<string, KnowledgeChunkSummary[]>>({});
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function toggleExpand(documentId: string) {
    if (expandedId === documentId) {
      setExpandedId(undefined);
      return;
    }
    setExpandedId(documentId);
    if (!chunksByDocumentId[documentId]) {
      const detail = await fetchKnowledgeDocumentDetail(entryId, documentId);
      setChunksByDocumentId((previous) => ({ ...previous, [documentId]: detail.chunks }));
    }
  }

  async function handleReprocess(documentId: string) {
    setIsPending(true);
    const result = await reprocessKnowledgeDocumentAction(entryId, documentId);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setDocuments((previous) => previous.map((document) => (document.id === documentId ? { ...document, status: "PENDING" } : document)));
  }

  return (
    <section className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Documents ({documents.length})</h2>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun document associé.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li key={document.id} id={`document-${document.id}`} className="rounded border border-neutral-100 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => toggleExpand(document.id)} className="text-left font-medium text-neutral-900 hover:underline">
                  Version v{document.versionNumber} {expandedId === document.id ? "▾" : "▸"}
                </button>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${documentStatusBadgeClass(document.status)}`}>
                    {KNOWLEDGE_DOCUMENT_STATUS_LABELS[document.status]}
                  </span>
                  {canManage && document.status === "FAILED" ? (
                    <button
                      type="button"
                      onClick={() => handleReprocess(document.id)}
                      disabled={isPending}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50"
                    >
                      Relancer le traitement
                    </button>
                  ) : null}
                </div>
              </div>
              {document.errorMessage ? <p className="mt-1 text-xs text-red-600">{document.errorMessage}</p> : null}
              {document.warnings.length > 0 ? (
                <p className="mt-1 text-xs text-amber-700">{document.warnings.join(" — ")}</p>
              ) : null}
              {expandedId === document.id ? (
                <div className="mt-2">
                  {chunksByDocumentId[document.id] ? (
                    <DocumentChunks chunks={chunksByDocumentId[document.id]!} />
                  ) : (
                    <p className="text-xs text-neutral-500">Chargement…</p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
