import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { EXPORT_DOCUMENT_TYPE_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_LABELS, canManageExportTemplates, exportTemplateVersionStatusBadgeClass, type ExportTemplateSummary } from "../../../../../lib/export-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Templates d'export — TenderOS" };

export default async function ExportTemplatesListPage() {
  let templates: ExportTemplateSummary[];
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([appApiFetch<ExportTemplateSummary[]>("/api/v1/exports/templates"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageExportTemplates(actorRole);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Templates d&apos;export</h1>
          <p className="text-sm text-neutral-600">Structure et mise en forme des documents générés (mémoire technique, matrice de conformité, etc.). Réservé OWNER/Administrateur.</p>
        </div>
        {canManage ? (
          <Link href="/app/ai-configuration/export-templates/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Nouveau template
          </Link>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun template d&apos;export pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Type de document</th>
                <th className="py-2 pr-4">Version active</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/export-templates/${template.id}`} className="font-medium text-neutral-900 hover:underline">
                      {template.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{EXPORT_DOCUMENT_TYPE_LABELS[template.documentType] ?? template.documentType}</td>
                  <td className="py-2 pr-4 text-neutral-600">{template.activeVersion ? `v${template.activeVersion.version}` : "—"}</td>
                  <td className="py-2 pr-4">
                    {template.activeVersion ? (
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${exportTemplateVersionStatusBadgeClass(template.activeVersion.status)}`}>
                        {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[template.activeVersion.status] ?? template.activeVersion.status}
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Aucune version active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
