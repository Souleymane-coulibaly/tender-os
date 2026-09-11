import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { EXPORT_DOCUMENT_TYPE_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_TONE, canManageExportTemplates, type ExportTemplateSummary } from "../../../../../lib/export-types";
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
      <Card
        title="Templates d'export"
        description="Structure et mise en forme des documents générés (mémoire technique, matrice de conformité, etc.). Réservé OWNER/Administrateur."
        actions={
          canManage ? (
            <Button href="/app/ai-configuration/export-templates/new" variant="primary">
              Nouveau template
            </Button>
          ) : null
        }
      >
        {templates.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun template d&apos;export pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nom</TableHeaderCell>
                <TableHeaderCell>Type de document</TableHeaderCell>
                <TableHeaderCell>Version active</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link href={`/app/ai-configuration/export-templates/${template.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {template.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{EXPORT_DOCUMENT_TYPE_LABELS[template.documentType] ?? template.documentType}</TableCell>
                  <TableCell className="text-tenderos-slate">{template.activeVersion ? `v${template.activeVersion.version}` : "—"}</TableCell>
                  <TableCell>
                    {template.activeVersion ? (
                      <Badge tone={EXPORT_TEMPLATE_VERSION_STATUS_TONE[template.activeVersion.status] ?? "neutral"}>
                        {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[template.activeVersion.status] ?? template.activeVersion.status}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Aucune version active</Badge>
                    )}
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
