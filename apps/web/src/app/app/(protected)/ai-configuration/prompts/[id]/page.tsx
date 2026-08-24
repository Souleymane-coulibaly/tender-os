import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { GENERATION_TASK_TYPE_LABELS, type PromptTemplateSummary, type PromptVersionSummary } from "../../../../../../lib/generation-types";
import { isOrganizationAdmin } from "../../../../../../lib/authorization";
import { ApiErrorState } from "../../../api-error-state";
import { ArchivePromptTemplateButton, CreatePromptVersionForm, PromptVersionActivateButton } from "./prompt-template-actions";

export const metadata: Metadata = { title: "Template de prompt — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageGeneration = isOrganizationAdmin;

function versionStatusBadgeClass(status: string): string {
  if (status === "ACTIVE") return "bg-green-100 text-green-800";
  if (status === "ARCHIVED") return "bg-neutral-200 text-neutral-700";
  return "bg-amber-100 text-amber-800";
}

export default async function PromptTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: { template: PromptTemplateSummary; versions: PromptVersionSummary[] };
  let actorRole: string | undefined;
  try {
    [data, actorRole] = await Promise.all([
      appApiFetch<{ template: PromptTemplateSummary; versions: PromptVersionSummary[] }>(`/api/v1/prompt-templates/${id}`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageGeneration(actorRole);
  const { template, versions } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{template.name}</h1>
          <p className="text-sm text-neutral-600">{GENERATION_TASK_TYPE_LABELS[template.taskType] ?? template.taskType}</p>
        </div>
        {canManage && !template.archivedAt ? <ArchivePromptTemplateButton templateId={template.id} /> : null}
      </div>

      {template.archivedAt ? (
        <p className="rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-600">Ce template est archivé.</p>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Versions</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucune version pour l&apos;instant — créez-en une ci-dessous.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Auteur</th>
                  <th className="py-2 pr-4">Créée le</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id} className="border-b border-neutral-100 align-top">
                    <td className="py-2 pr-4 font-medium text-neutral-900">v{version.version}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${versionStatusBadgeClass(version.status)}`}>{version.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{version.authorUserId}</td>
                    <td className="py-2 pr-4 text-neutral-600">{new Date(version.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="py-2 pr-4">
                      {canManage && version.status === "DRAFT" ? (
                        <PromptVersionActivateButton templateId={template.id} versionId={version.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && !template.archivedAt ? <CreatePromptVersionForm templateId={template.id} /> : null}
    </div>
  );
}
