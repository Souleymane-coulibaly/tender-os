import type { Metadata } from "next";
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <p className="text-sm text-neutral-600">
            {DOCUMENT_DOMAIN_LABELS[doc.domain]} — {DOCUMENT_ORIGIN_LABELS[doc.origin]}
            {doc.category ? ` — ${doc.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${
              doc.status === "ARCHIVED" ? "bg-neutral-200 text-neutral-700" : "bg-green-100 text-green-800"
            }`}
          >
            {DOCUMENT_STATUS_LABELS[doc.status]}
          </span>
          {canManage ? <LifecycleActions doc={doc} /> : null}
        </div>
      </div>

      {doc.description ? <p className="text-sm text-neutral-700">{doc.description}</p> : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Versions</h2>
          <a
            href={`/app/documents/${doc.id}/download`}
            className="text-sm text-neutral-700 hover:underline"
          >
            Télécharger la version courante
          </a>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 pr-4">Version</th>
              <th className="py-2 pr-4">Fichier</th>
              <th className="py-2 pr-4">Taille</th>
              <th className="py-2 pr-4">Déposé le</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id} className="border-b border-neutral-100">
                <td className="py-2 pr-4">
                  v{version.versionNumber}
                  {version.versionNumber === doc.currentVersionNumber ? (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">courante</span>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{version.originalFilename}</td>
                <td className="py-2 pr-4 text-neutral-600">{formatFileSize(version.sizeBytes)}</td>
                <td className="py-2 pr-4 text-neutral-600">{new Date(version.createdAt).toLocaleString("fr-FR")}</td>
                <td className="py-2 pr-4">
                  <a
                    href={`/app/documents/${doc.id}/download?versionId=${version.id}`}
                    className="text-neutral-700 hover:underline"
                  >
                    Télécharger
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canEdit && doc.status === "ACTIVE" ? (
        <>
          <AddVersionForm documentId={doc.id} />
          <UpdateMetadataForm document={doc} />
        </>
      ) : null}
    </div>
  );
}
