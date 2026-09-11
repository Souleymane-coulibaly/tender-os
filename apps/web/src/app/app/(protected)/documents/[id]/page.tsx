import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  DOCUMENT_DOMAIN_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_STATUS_LABELS,
  canManageDocumentLifecycle,
  canUploadOrEditDocument,
  formatFileSize,
  type DocumentSummary,
  type DocumentVersionSummary,
} from "../../../../../lib/documents-types";
import { ApiErrorState } from "../../api-error-state";
import { AddVersionForm } from "./add-version-form";
import { LifecycleActions } from "./lifecycle-actions";
import { UpdateMetadataForm } from "./update-metadata-form";

export const metadata: Metadata = { title: "Détail du document — TenderOS" };

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let doc: DocumentSummary;
  let versions: DocumentVersionSummary[];
  let role: string | undefined;
  try {
    [doc, versions, role] = await Promise.all([
      appApiFetch<DocumentSummary>(`/api/v1/documents/${id}`),
      appApiFetch<DocumentVersionSummary[]>(`/api/v1/documents/${id}/versions`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canEdit = canUploadOrEditDocument(role);
  const canManage = canManageDocumentLifecycle(role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Documents", href: "/app/documents" }, { label: doc.title }]}
        title={doc.title}
        description={
          <>
            {DOCUMENT_DOMAIN_LABELS[doc.domain]} — {DOCUMENT_ORIGIN_LABELS[doc.origin]}
            {doc.category ? ` — ${doc.category}` : ""}
            {doc.description ? <span className="mt-1 block text-tenderos-navy">{doc.description}</span> : null}
          </>
        }
        status={<Badge tone={doc.status === "ARCHIVED" ? "neutral" : "success"}>{DOCUMENT_STATUS_LABELS[doc.status]}</Badge>}
        actions={canManage ? <LifecycleActions doc={doc} /> : undefined}
      />

      <Card
        title="Versions"
        actions={
          <a href={`/app/documents/${doc.id}/download`} className="text-sm text-tenderos-blue hover:underline">
            Télécharger la version courante
          </a>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                <th scope="col" className="py-2 pr-4">Version</th>
                <th scope="col" className="py-2 pr-4">Fichier</th>
                <th scope="col" className="py-2 pr-4">Taille</th>
                <th scope="col" className="py-2 pr-4">Déposé le</th>
                <th scope="col" className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b border-tenderos-navy/10 last:border-0">
                  <td className="py-2 pr-4 text-tenderos-navy">
                    v{version.versionNumber}
                    {version.versionNumber === doc.currentVersionNumber ? (
                      <span className="ml-2">
                        <Badge tone="info">courante</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">{version.originalFilename}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">{formatFileSize(version.sizeBytes)}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">{new Date(version.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    <a href={`/app/documents/${doc.id}/download?versionId=${version.id}`} className="text-tenderos-blue hover:underline">
                      Télécharger
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canEdit && doc.status === "ACTIVE" ? (
        <>
          <AddVersionForm documentId={doc.id} />
          <UpdateMetadataForm document={doc} />
        </>
      ) : null}
    </div>
  );
}
