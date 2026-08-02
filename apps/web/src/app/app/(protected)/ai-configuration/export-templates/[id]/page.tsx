import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { EXPORT_DOCUMENT_TYPE_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_LABELS, canManageExportTemplates, exportTemplateVersionStatusBadgeClass, type ExportTemplateSummary } from "../../../../../../lib/export-types";
import { ApiErrorState } from "../../../api-error-state";
import { ExportTemplateVersionManager } from "./export-template-actions";

export const metadata: Metadata = { title: "Template d'export — TenderOS" };

/** Mission Sprint 8A §16 — pas de route `GET /exports/templates/:id` dédiée côté backend (seule
 *  `GET /exports/templates` existe) : le template recherché est retrouvé dans la liste complète,
 *  acceptable pour un volume de templates d'organisation (quelques dizaines au plus). */
export default async function ExportTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let templates: ExportTemplateSummary[];
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([appApiFetch<ExportTemplateSummary[]>("/api/v1/exports/templates"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const template = templates.find((t) => t.id === id);
  if (!template) {
    notFound();
  }

  const canManage = canManageExportTemplates(actorRole);
  const defaultConfig = JSON.stringify(template.activeVersion?.config ?? { sections: [{ id: "INTRODUCTION", label: "Introduction", mandatory: true, order: 0 }] }, null, 2);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{template.name}</h1>
        <p className="text-sm text-neutral-600">{EXPORT_DOCUMENT_TYPE_LABELS[template.documentType] ?? template.documentType}</p>
        {template.description ? <p className="mt-1 text-sm text-neutral-600">{template.description}</p> : null}
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Version active</h2>
        {template.activeVersion ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-700">v{template.activeVersion.version}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${exportTemplateVersionStatusBadgeClass(template.activeVersion.status)}`}>
                {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[template.activeVersion.status] ?? template.activeVersion.status}
              </span>
              <span className="text-xs text-neutral-500">{template.activeVersion.format}</span>
            </div>
            <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs text-neutral-700">{JSON.stringify(template.activeVersion.config, null, 2)}</pre>
          </div>
        ) : (
          <p className="text-sm text-amber-700">Aucune version active — les exports utilisant ce template échoueront tant qu&apos;aucune version n&apos;est activée.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Gestion des versions</h2>
          <ExportTemplateVersionManager templateId={template.id} activeVersion={template.activeVersion} defaultConfig={defaultConfig} />
        </section>
      ) : null}
    </div>
  );
}
