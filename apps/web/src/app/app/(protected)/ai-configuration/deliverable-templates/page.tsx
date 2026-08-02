import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { DELIVERABLE_TYPE_LABELS, canManageDeliverableTemplates } from "../../../../../lib/deliverable-types";
import type { DeliverableTemplateSummary } from "../../../deliverable-actions";
import { ApiErrorState } from "../../api-error-state";
import { CreateDeliverableTemplateForm } from "./create-template-form";

export const metadata: Metadata = { title: "Templates de mémoire — TenderOS" };

/**
 * Mission Sprint 8A.1 §5 — structure des sections d'un Mémoire technique/Synthèse exécutive
 * (jamais la mise en page physique, voir Identité documentaire). Créé ici au palier ORGANIZATION
 * (§5 "système TenderOS") — un palier TENDER/CLIENT reste possible côté API, non exposé dans cette
 * UI minimale (décision de portée).
 */
export default async function DeliverableTemplatesListPage() {
  let templates: DeliverableTemplateSummary[];
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([appApiFetch<DeliverableTemplateSummary[]>("/api/v1/deliverable-templates"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageDeliverableTemplates(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Templates de mémoire</h1>
        <p className="text-sm text-neutral-600">Structure des sections du Mémoire technique/de la Synthèse exécutive — obligatoires/facultatives, instructions, type de génération IA. Réservé OWNER/Administrateur.</p>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun template pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Type de document</th>
                <th className="py-2 pr-4">Palier</th>
                <th className="py-2 pr-4">Version active</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/deliverable-templates/${template.id}`} className="font-medium text-neutral-900 hover:underline">
                      {template.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{DELIVERABLE_TYPE_LABELS[template.documentType] ?? template.documentType}</td>
                  <td className="py-2 pr-4 text-neutral-600">{template.scopeLevel}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {template.activeVersion ? (
                      `v${template.activeVersion.version}`
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

      {canManage ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Nouveau template</h2>
          <CreateDeliverableTemplateForm />
        </section>
      ) : null}
    </div>
  );
}
