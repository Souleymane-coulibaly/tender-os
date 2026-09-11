import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import {
  canValidateKnowledgeEntry,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  KNOWLEDGE_STATUS_TONE,
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
  const canValidate = canValidateKnowledgeEntry(role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Base de connaissances", href: "/app/knowledge" }, { label: entry.title }]}
        title={entry.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {KNOWLEDGE_CATEGORY_LABELS[entry.category]} — v{entry.activeVersionNumber}
              {entry.language ? ` — ${entry.language}` : ""}
            </span>
            {entry.clientAccountId ? (
              <Badge tone="info">
                {client ? (
                  <Link href={`/app/clients/${entry.clientAccountId}`} className="hover:underline">
                    {client.name}
                  </Link>
                ) : (
                  "Client"
                )}
              </Badge>
            ) : (
              <Badge>Globale</Badge>
            )}
          </span>
        }
        status={
          <>
            <Badge tone={KNOWLEDGE_STATUS_TONE[entry.status] ?? "neutral"}>{KNOWLEDGE_STATUS_LABELS[entry.status]}</Badge>
            {entry.validatedAt ? <Badge tone="success">Validée le {new Date(entry.validatedAt).toLocaleDateString("fr-FR")}</Badge> : null}
          </>
        }
        actions={canManageLifecycle ? <KnowledgeLifecycleActions entry={entry} canDelete={canDelete} canValidate={canValidate} /> : undefined}
      />

      {entry.description || entry.sourceTenderId ? (
        <Card padding="tight">
          <div className="flex flex-col gap-2">
            {entry.description ? <p className="text-sm text-tenderos-navy">{entry.description}</p> : null}

            {entry.sourceTenderId ? (
              <p className="text-xs text-tenderos-slate">
                Promue depuis{" "}
                <Link href={`/app/tenders/${entry.sourceTenderId}`} className="text-tenderos-blue hover:underline">
                  un appel d&apos;offres
                </Link>
                {entry.promotedAt ? ` le ${new Date(entry.promotedAt).toLocaleDateString("fr-FR")}` : ""}.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <KnowledgeTagsManager entryId={entry.id} tags={entry.tags} canManage={canEdit} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <KnowledgeDocumentsSection entryId={entry.id} initialDocuments={documents} canManage={canEdit} />
        <KnowledgeVersionsSection entryId={entry.id} initialVersions={versions} canRestore={canEdit} />
      </div>

      {canEdit ? (
        <>
          <AddKnowledgeDocumentForm entryId={entry.id} />
          <UpdateKnowledgeEntryForm entry={entry} />
        </>
      ) : null}
    </div>
  );
}
