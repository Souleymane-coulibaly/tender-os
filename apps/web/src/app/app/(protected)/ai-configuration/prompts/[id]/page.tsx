import type { Metadata } from "next";
import { Alert, Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, type BadgeTone } from "../../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  GENERATION_TASK_TYPE_LABELS,
  type PromptTemplateSummary,
  type PromptVersionSummary,
} from "../../../../../../lib/generation-types";
import { isOrganizationAdmin } from "../../../../../../lib/authorization";
import { ApiErrorState } from "../../../api-error-state";
import {
  ArchivePromptTemplateButton,
  CreatePromptVersionForm,
  PromptVersionActivateButton,
} from "./prompt-template-actions";
import { VERSION_STATUS_LABELS } from "../../../../../../lib/version-status";

export const metadata: Metadata = { title: "Template de prompt — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageGeneration = isOrganizationAdmin;

/** Design System — ton du `Badge` de statut de version (remplace l'ancien `versionStatusBadgeClass()`).
 *  Tout statut inconnu retombe sur `warning`, comme l'ancien cas par défaut (ambre). */
const VERSION_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
  DRAFT: "warning",
};

export default async function PromptTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: { template: PromptTemplateSummary; versions: PromptVersionSummary[] };
  let actorRole: string | undefined;
  try {
    [data, actorRole] = await Promise.all([
      appApiFetch<{ template: PromptTemplateSummary; versions: PromptVersionSummary[] }>(
        `/api/v1/prompt-templates/${id}`,
      ),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageGeneration(actorRole);
  const { template, versions } = data;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="link" href="/app/ai-configuration/prompts" className="self-start">
        ← Prompts
      </Button>

      <Card
        title={template.name}
        description={GENERATION_TASK_TYPE_LABELS[template.taskType] ?? template.taskType}
        actions={canManage && !template.archivedAt ? <ArchivePromptTemplateButton templateId={template.id} /> : null}
      >
        <div className="flex flex-col gap-4">
          {template.archivedAt ? <Alert tone="info">Ce template est archivé.</Alert> : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-tenderos-navy">Versions</h3>
            {versions.length === 0 ? (
              <p className="text-sm text-tenderos-slate">Aucune version pour l&apos;instant — créez-en une ci-dessous.</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Version</TableHeaderCell>
                    <TableHeaderCell>Statut</TableHeaderCell>
                    <TableHeaderCell>Auteur</TableHeaderCell>
                    <TableHeaderCell>Créée le</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id} className="align-top">
                      <TableCell className="font-medium">v{version.version}</TableCell>
                      <TableCell>
                        <Badge tone={VERSION_STATUS_TONE[version.status] ?? "warning"}>
                          {VERSION_STATUS_LABELS[version.status] ?? version.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-tenderos-slate">{version.authorUserId}</TableCell>
                      <TableCell className="text-tenderos-slate">{new Date(version.createdAt).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        {canManage && version.status === "DRAFT" ? (
                          <PromptVersionActivateButton templateId={template.id} versionId={version.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </Card>

      {canManage && !template.archivedAt ? <CreatePromptVersionForm templateId={template.id} /> : null}
    </div>
  );
}
