import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { canManageDeliverableTemplates } from "../../../../../lib/deliverable-types";
import type { DocumentThemeSummary } from "../../../deliverable-actions";
import { ApiErrorState } from "../../api-error-state";
import { CreateDocumentThemeForm } from "./create-theme-form";

export const metadata: Metadata = { title: "Identité documentaire — TenderOS" };

/** Mission Sprint 8A.1 §6 — logo/couleurs/polices/mise en page des documents exportés (jamais la
 *  structure des sections, voir Templates de mémoire). Créé au palier ORGANIZATION (§6 "système
 *  TenderOS") — paliers TENDER/CLIENT non exposés dans cette UI minimale (décision de portée). */
export default async function DocumentThemesListPage() {
  let themes: DocumentThemeSummary[];
  let actorRole: string | undefined;
  try {
    [themes, actorRole] = await Promise.all([appApiFetch<DocumentThemeSummary[]>("/api/v1/document-themes"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageDeliverableTemplates(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Identité documentaire" description="Couleurs, police, logo — appliqués aux documents exportés (DOCX/PDF). Réservé OWNER/Administrateur.">
        {themes.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun thème pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nom</TableHeaderCell>
                <TableHeaderCell>Palier</TableHeaderCell>
                <TableHeaderCell>Version active</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {themes.map((theme) => (
                <TableRow key={theme.id}>
                  <TableCell>
                    <Link href={`/app/ai-configuration/document-themes/${theme.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {theme.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{theme.scopeLevel}</TableCell>
                  <TableCell className="text-tenderos-slate">
                    {theme.activeVersion ? `v${theme.activeVersion.version}` : <Badge tone="warning">Aucune version active</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {canManage ? (
        <Card title="Nouveau thème">
          <CreateDocumentThemeForm />
        </Card>
      ) : null}
    </div>
  );
}
