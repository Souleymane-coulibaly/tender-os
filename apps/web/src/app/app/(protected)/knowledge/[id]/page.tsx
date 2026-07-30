import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  knowledgeStatusBadgeClass,
  type KnowledgeDocumentSummary,
  type KnowledgeEntrySummary,
  type KnowledgeEntryVersionSummary,
} from "../../../../../lib/knowledge-types";
import { ApiErrorState } from "../../api-error-state";
import { AddKnowledgeDocumentForm } from "./add-knowledge-document-form";
import { KnowledgeDocumentsSection } from "./knowledge-documents-section";
import { KnowledgeLifecycleActions } from "./knowledge-lifecycle-actions";
import { KnowledgeTagsManager } from "./knowledge-tags-manager";
import { KnowledgeVersionsSection } from "./knowledge-versions-section";
import { UpdateKnowledgeEntryForm } from "./update-knowledge-entry-form";

export const metadata: Metadata = { title: "Détail de l'entrée — Base de connaissances — TenderOS" };

export default async function KnowledgeEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let entry: KnowledgeEntrySummary;
  let documents: KnowledgeDocumentSummary[];
  let versions: KnowledgeEntryVersionSummary[];
  let role: string | undefined;
  try {
    [entry, documents, versions, role] = await Promise.all([
      appApiFetch<KnowledgeEntrySummary>(`/api/v1/knowledge/entries/${id}`),
      appApiFetch<KnowledgeDocumentSummary[]>(`/api/v1/knowledge/entries/${id}/documents`),
      appApiFetch<KnowledgeEntryVersionSummary[]>(`/api/v1/knowledge/entries/${id}/versions`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  // Mission Sprint 5.1 §"affichage du contexte" — le nom du client n'est resolu que si l'entree
  // en a un (connaissance globale sinon, jamais d'appel superflu).
  let client: ClientAccountSummary | undefined;
  if (entry.clientAccountId) {
    try {
      client = await appApiFetch<ClientAccountSummary>(`/api/v1/clients/${entry.clientAccountId}`);
    } catch {
      client = undefined;
    }
  }

  const canEdit = role !== undefined && role !== "READ_ONLY" && role !== "REVIEWER" && role !== "EXECUTIVE" && role !== "EXTERNAL_CONSULTANT";
  const canManageLifecycle = canEdit;
  const canDelete = role !== undefined && ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"].includes(role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{entry.title}</h1>
          <p className="text-sm text-neutral-600">
            {KNOWLEDGE_CATEGORY_LABELS[entry.category]} — v{entry.activeVersionNumber}
            {entry.language ? ` — ${entry.language}` : ""}
          </p>
          <div className="mt-1">
            {entry.clientAccountId ? (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {client ? (
                  <Link href={`/app/clients/${entry.clientAccountId}`} className="hover:underline">
                    {client.name}
                  </Link>
                ) : (
                  "Client"
                )}
              </span>
            ) : (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">Globale</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded px-2 py-1 text-xs font-medium ${knowledgeStatusBadgeClass(entry.status)}`}>
            {KNOWLEDGE_STATUS_LABELS[entry.status]}
          </span>
          {canManageLifecycle ? <KnowledgeLifecycleActions entry={entry} canDelete={canDelete} /> : null}
        </div>
      </div>

      {entry.description ? <p className="text-sm text-neutral-700">{entry.description}</p> : null}

      <KnowledgeTagsManager entryId={entry.id} tags={entry.tags} canManage={canEdit} />

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <KnowledgeDocumentsSection entryId={entry.id} initialDocuments={documents} canManage={canEdit} />
        <KnowledgeVersionsSection entryId={entry.id} initialVersions={versions} canRestore={canEdit} />
      </section>

      {canEdit ? (
        <>
          <AddKnowledgeDocumentForm entryId={entry.id} />
          <UpdateKnowledgeEntryForm entry={entry} />
        </>
      ) : null}
    </div>
  );
}
