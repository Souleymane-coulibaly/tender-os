import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
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
      <div data-tour="guide-ai-configuration-list">
        <Card
          title="Templates de mémoire"
          description="Structure des sections du Mémoire technique/de la Synthèse exécutive — obligatoires/facultatives, instructions, type de génération IA. Réservé OWNER/Administrateur."
        >
          {templates.length === 0 ? (
            <p className="text-sm text-tenderos-slate">Aucun template pour l&apos;instant.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nom</TableHeaderCell>
                  <TableHeaderCell>Type de document</TableHeaderCell>
                  <TableHeaderCell>Palier</TableHeaderCell>
                  <TableHeaderCell>Version active</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Link href={`/app/ai-configuration/deliverable-templates/${template.id}`} className="font-medium text-tenderos-navy hover:underline">
                        {template.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-tenderos-slate">{DELIVERABLE_TYPE_LABELS[template.documentType] ?? template.documentType}</TableCell>
                    <TableCell className="text-tenderos-slate">{template.scopeLevel}</TableCell>
                    <TableCell className="text-tenderos-slate">
                      {template.activeVersion ? `v${template.activeVersion.version}` : <Badge tone="warning">Aucune version active</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {canManage ? (
        <div data-tour="guide-ai-configuration-create">
          <Card title="Nouveau template">
            <CreateDeliverableTemplateForm />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
