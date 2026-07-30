import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
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
