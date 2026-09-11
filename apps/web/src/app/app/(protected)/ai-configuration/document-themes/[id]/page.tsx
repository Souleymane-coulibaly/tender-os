import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Card } from "../../../../../../components/ui";
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
      <Button variant="link" href="/app/ai-configuration/document-themes" className="self-start">
        ← Identité documentaire
      </Button>

      <Card title={theme.name} description={theme.scopeLevel}>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-tenderos-navy">Version active</h3>
          {theme.activeVersion ? (
            <div className="flex items-center gap-3 text-sm text-tenderos-navy">
              <span>v{theme.activeVersion.version}</span>
              {theme.activeVersion.accentColor ? (
                <span className="flex items-center gap-1">
                  {/* Seul style inline autorisé : aperçu de la couleur choisie par l'utilisateur. */}
                  <span className="inline-block h-4 w-4 rounded border border-tenderos-navy/15" style={{ backgroundColor: theme.activeVersion.accentColor }} />
                  {theme.activeVersion.accentColor}
                </span>
              ) : null}
              {theme.activeVersion.fontFamily ? <span>{theme.activeVersion.fontFamily}</span> : null}
            </div>
          ) : (
            <p className="text-sm text-warning-fg">Aucune version active — les exports utiliseront la mise en forme par défaut.</p>
          )}
        </div>
      </Card>

      {canManage ? (
        <Card title="Gestion des versions">
          <DocumentThemeVersionManager themeId={theme.id} defaultAccentColor={theme.activeVersion?.accentColor ?? "#1A56DB"} defaultFontFamily={theme.activeVersion?.fontFamily ?? ""} />
        </Card>
      ) : null}
    </div>
  );
}
