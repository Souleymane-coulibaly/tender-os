"use client";

import { useState } from "react";
import { Badge, Button, Card, type BadgeTone } from "../../../../../components/ui";
import { fetchKnowledgeDocumentDetail, reprocessKnowledgeDocumentAction } from "../../../knowledge-actions";
import {
  KNOWLEDGE_DOCUMENT_STATUS_LABELS,
  formatProvenanceLocation,
  type KnowledgeChunkSummary,
  type KnowledgeDocumentStatus,
  type KnowledgeDocumentSummary,
} from "../../../../../lib/knowledge-types";

/** Ton du `Badge` de statut d'un document de connaissance. */
const DOCUMENT_STATUS_TONE: Record<KnowledgeDocumentStatus, BadgeTone> = {
  PENDING: "info",
  PROCESSING: "info",
  READY: "success",
  FAILED: "danger",
};

function DocumentChunks({ chunks }: { chunks: KnowledgeChunkSummary[] }) {
  if (chunks.length === 0) {
    return <p className="text-xs text-tenderos-slate">Aucun contenu extrait.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {chunks.map((chunk) => {
        const location = formatProvenanceLocation(chunk);
        return (
          <li key={chunk.id} className="rounded-lg border border-tenderos-navy/10 bg-tenderos-light p-2 text-xs">
            <p className="text-tenderos-navy">{chunk.content}</p>
            <p className="mt-1 text-tenderos-slate">
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
    <Card title={`Documents (${documents.length})`}>
      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun document associé.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.map((document) => (
              <li key={document.id} id={`document-${document.id}`} className="rounded-lg border border-tenderos-navy/10 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="link" onClick={() => toggleExpand(document.id)} className="text-left">
                    Version v{document.versionNumber} {expandedId === document.id ? "▾" : "▸"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge tone={DOCUMENT_STATUS_TONE[document.status] ?? "neutral"}>{KNOWLEDGE_DOCUMENT_STATUS_LABELS[document.status]}</Badge>
                    {canManage && document.status === "FAILED" ? (
                      <Button type="button" size="sm" onClick={() => handleReprocess(document.id)} disabled={isPending}>
                        Relancer le traitement
                      </Button>
                    ) : null}
                  </div>
                </div>
                {document.errorMessage ? <p className="mt-1 text-xs text-danger-fg">{document.errorMessage}</p> : null}
                {document.warnings.length > 0 ? (
                  <p className="mt-1 text-xs text-warning-fg">{document.warnings.join(" — ")}</p>
                ) : null}
                {expandedId === document.id ? (
                  <div className="mt-2">
                    {chunksByDocumentId[document.id] ? (
                      <DocumentChunks chunks={chunksByDocumentId[document.id]!} />
                    ) : (
                      <p className="text-xs text-tenderos-slate">Chargement…</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
