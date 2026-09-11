import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Button, Card } from "../../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { EXPORT_DOCUMENT_TYPE_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_TONE, canManageExportTemplates, type ExportTemplateSummary } from "../../../../../../lib/export-types";
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
      <Button variant="link" href="/app/ai-configuration/export-templates" className="self-start">
        ← Templates d&apos;export
      </Button>

      <Card title={template.name} description={EXPORT_DOCUMENT_TYPE_LABELS[template.documentType] ?? template.documentType}>
        <div className="flex flex-col gap-3">
          {template.description ? <p className="text-sm text-tenderos-slate">{template.description}</p> : null}
          <h3 className="text-sm font-semibold text-tenderos-navy">Version active</h3>
          {template.activeVersion ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-tenderos-navy">v{template.activeVersion.version}</span>
                <Badge tone={EXPORT_TEMPLATE_VERSION_STATUS_TONE[template.activeVersion.status] ?? "neutral"}>
                  {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[template.activeVersion.status] ?? template.activeVersion.status}
                </Badge>
                <span className="text-xs text-tenderos-slate">{template.activeVersion.format}</span>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-tenderos-light p-3 text-xs text-tenderos-navy">{JSON.stringify(template.activeVersion.config, null, 2)}</pre>
            </div>
          ) : (
            <p className="text-sm text-warning-fg">Aucune version active — les exports utilisant ce template échoueront tant qu&apos;aucune version n&apos;est activée.</p>
          )}
        </div>
      </Card>

      {canManage ? (
        <Card title="Gestion des versions">
          <ExportTemplateVersionManager templateId={template.id} activeVersion={template.activeVersion} defaultConfig={defaultConfig} />
        </Card>
      ) : null}
    </div>
  );
}
