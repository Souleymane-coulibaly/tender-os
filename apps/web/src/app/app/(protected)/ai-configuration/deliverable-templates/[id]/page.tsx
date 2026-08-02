import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { DELIVERABLE_TYPE_LABELS, canManageDeliverableTemplates } from "../../../../../../lib/deliverable-types";
import type { DeliverableTemplateSummary } from "../../../../deliverable-actions";
import { ApiErrorState } from "../../../api-error-state";
import { DeliverableTemplateVersionManager } from "./template-version-manager";

export const metadata: Metadata = { title: "Template de mémoire — TenderOS" };

/** Pas de route `GET /deliverable-templates/:id` dédiée côté backend (seule `GET
 *  /deliverable-templates` existe) — même limite documentée qu'Export (Sprint 8A). */
export default async function DeliverableTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let templates: DeliverableTemplateSummary[];
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([appApiFetch<DeliverableTemplateSummary[]>("/api/v1/deliverable-templates"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const template = templates.find((t) => t.id === id);
  if (!template) {
    notFound();
  }

  const canManage = canManageDeliverableTemplates(actorRole);
  const defaultSections = JSON.stringify(template.activeVersion?.sections ?? [], null, 2);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{template.name}</h1>
        <p className="text-sm text-neutral-600">
          {DELIVERABLE_TYPE_LABELS[template.documentType] ?? template.documentType} — {template.scopeLevel}
        </p>
        {template.note ? <p className="mt-1 text-sm italic text-neutral-500">{template.note}</p> : null}
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Version active</h2>
        {template.activeVersion ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-neutral-700">v{template.activeVersion.version}</span>
            <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs text-neutral-700">{JSON.stringify(template.activeVersion.sections, null, 2)}</pre>
          </div>
        ) : (
          <p className="text-sm text-amber-700">Aucune version active — les Mémoires techniques de ce type resteront sans section tant qu&apos;aucune version n&apos;est activée.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Gestion des versions</h2>
          <DeliverableTemplateVersionManager templateId={template.id} defaultSections={defaultSections} />
        </section>
      ) : null}
    </div>
  );
}
