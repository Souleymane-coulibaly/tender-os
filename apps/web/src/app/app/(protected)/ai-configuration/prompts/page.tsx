import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { GENERATION_TASK_TYPE_LABELS, type PromptTemplateSummary } from "../../../../../lib/generation-types";
import { isOrganizationAdmin } from "../../../../../lib/authorization";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Configuration IA — Prompts — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageGeneration = isOrganizationAdmin;

export default async function PromptTemplatesListPage() {
  let templates: PromptTemplateSummary[];
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([
      appApiFetch<PromptTemplateSummary[]>("/api/v1/prompt-templates"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageGeneration(actorRole);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Templates de prompts</h1>
          <p className="text-sm text-neutral-600">
            Un template par type de contenu généré. Chaque génération utilise la version ACTIVE au moment où elle est lancée
            — jamais recalculée après coup.
          </p>
        </div>
        {canManage ? (
          <Link href="/app/ai-configuration/prompts/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Nouveau template
          </Link>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun template de prompt pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Type de tâche</th>
                <th className="py-2 pr-4">Mode de sortie</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/prompts/${template.id}`} className="font-medium text-neutral-900 hover:underline">
                      {template.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{GENERATION_TASK_TYPE_LABELS[template.taskType] ?? template.taskType}</td>
                  <td className="py-2 pr-4 text-neutral-600">{template.outputMode === "STRUCTURED" ? "Structuré" : "Texte libre"}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/prompts/${template.id}`} className="text-neutral-700 hover:underline">
                      Ouvrir
                    </Link>
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
