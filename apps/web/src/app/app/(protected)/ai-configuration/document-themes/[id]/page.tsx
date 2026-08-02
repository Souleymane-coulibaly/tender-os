import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { canManageDeliverableTemplates } from "../../../../../../lib/deliverable-types";
import type { DocumentThemeSummary } from "../../../../deliverable-actions";
import { ApiErrorState } from "../../../api-error-state";
import { DocumentThemeVersionManager } from "./theme-version-manager";

export const metadata: Metadata = { title: "Thème documentaire — TenderOS" };

export default async function DocumentThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let themes: DocumentThemeSummary[];
  let actorRole: string | undefined;
  try {
    [themes, actorRole] = await Promise.all([appApiFetch<DocumentThemeSummary[]>("/api/v1/document-themes"), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const theme = themes.find((t) => t.id === id);
  if (!theme) {
    notFound();
  }

  const canManage = canManageDeliverableTemplates(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{theme.name}</h1>
        <p className="text-sm text-neutral-600">{theme.scopeLevel}</p>
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Version active</h2>
        {theme.activeVersion ? (
          <div className="flex items-center gap-3 text-sm text-neutral-700">
            <span>v{theme.activeVersion.version}</span>
            {theme.activeVersion.accentColor ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded border border-neutral-300" style={{ backgroundColor: theme.activeVersion.accentColor }} />
                {theme.activeVersion.accentColor}
              </span>
            ) : null}
            {theme.activeVersion.fontFamily ? <span>{theme.activeVersion.fontFamily}</span> : null}
          </div>
        ) : (
          <p className="text-sm text-amber-700">Aucune version active — les exports utiliseront la mise en forme par défaut.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Gestion des versions</h2>
          <DocumentThemeVersionManager themeId={theme.id} defaultAccentColor={theme.activeVersion?.accentColor ?? "#1A56DB"} defaultFontFamily={theme.activeVersion?.fontFamily ?? ""} />
        </section>
      ) : null}
    </div>
  );
}
