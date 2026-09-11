import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Card } from "../../../../../../components/ui";
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
      <Button variant="link" href="/app/ai-configuration/deliverable-templates" className="self-start">
        ← Templates de mémoire
      </Button>

      <Card title={template.name} description={`${DELIVERABLE_TYPE_LABELS[template.documentType] ?? template.documentType} — ${template.scopeLevel}`}>
        <div className="flex flex-col gap-3">
          {template.note ? <p className="text-sm italic text-tenderos-slate">{template.note}</p> : null}
          <h3 className="text-sm font-semibold text-tenderos-navy">Version active</h3>
          {template.activeVersion ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-tenderos-navy">v{template.activeVersion.version}</span>
              <pre className="overflow-x-auto rounded-lg bg-tenderos-light p-3 text-xs text-tenderos-navy">{JSON.stringify(template.activeVersion.sections, null, 2)}</pre>
            </div>
          ) : (
            <p className="text-sm text-warning-fg">Aucune version active — les Mémoires techniques de ce type resteront sans section tant qu&apos;aucune version n&apos;est activée.</p>
          )}
        </div>
      </Card>

      {canManage ? (
        <Card title="Gestion des versions">
          <DeliverableTemplateVersionManager templateId={template.id} defaultSections={defaultSections} />
        </Card>
      ) : null}
    </div>
  );
}
