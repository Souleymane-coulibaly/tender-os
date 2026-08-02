import type { Metadata } from "next";
import Link from "next/link";
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
      <div>
        <h1 className="text-xl font-semibold">Identité documentaire</h1>
        <p className="text-sm text-neutral-600">Couleurs, police, logo — appliqués aux documents exportés (DOCX/PDF). Réservé OWNER/Administrateur.</p>
      </div>

      {themes.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun thème pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Palier</th>
                <th className="py-2 pr-4">Version active</th>
              </tr>
            </thead>
            <tbody>
              {themes.map((theme) => (
                <tr key={theme.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/document-themes/${theme.id}`} className="font-medium text-neutral-900 hover:underline">
                      {theme.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{theme.scopeLevel}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {theme.activeVersion ? (
                      `v${theme.activeVersion.version}`
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
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Nouveau thème</h2>
          <CreateDocumentThemeForm />
        </section>
      ) : null}
    </div>
  );
}
