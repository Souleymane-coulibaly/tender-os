import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
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
    <div data-tour="guide-ai-configuration-list" className="flex flex-col gap-4">
      <Card
        title="Templates de prompts"
        description="Un template par type de contenu généré. Chaque génération utilise la version ACTIVE au moment où elle est lancée — jamais recalculée après coup."
        actions={
          canManage ? (
            <div data-tour="guide-ai-configuration-create" className="flex">
              <Button href="/app/ai-configuration/prompts/new" variant="primary">
                Nouveau template
              </Button>
            </div>
          ) : null
        }
      >
        {templates.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun template de prompt pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nom</TableHeaderCell>
                <TableHeaderCell>Type de tâche</TableHeaderCell>
                <TableHeaderCell>Mode de sortie</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link href={`/app/ai-configuration/prompts/${template.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {template.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{GENERATION_TASK_TYPE_LABELS[template.taskType] ?? template.taskType}</TableCell>
                  <TableCell className="text-tenderos-slate">{template.outputMode === "STRUCTURED" ? "Structuré" : "Texte libre"}</TableCell>
                  <TableCell>
                    <Link href={`/app/ai-configuration/prompts/${template.id}`} className="text-tenderos-blue hover:underline">
                      Ouvrir
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
