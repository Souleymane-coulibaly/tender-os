import type { Metadata } from "next";
import { AppApiError, appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { ExportJobSummary } from "../../../../../../lib/export-types";
import type { ReadinessStatusResult, ValidationRunSummary } from "../../../../../../lib/validation-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { ValidationSection } from "./validation-section";

export const metadata: Metadata = { title: "Validation — TenderOS" };

export default async function TenderValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let readiness: ReadinessStatusResult;
  let exportHistory: { items: ExportJobSummary[]; total: number };
  let actorRole: string | undefined;
  try {
    [readiness, exportHistory, actorRole] = await Promise.all([
      appApiFetch<ReadinessStatusResult>(`/api/v1/tenders/${tenderId}/validation/readiness`),
      appApiFetch<{ items: ExportJobSummary[]; total: number }>(`/api/v1/tenders/${tenderId}/exports?mode=PREVIEW&limit=20&offset=0`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  // Mission §26 — l'absence de run est un état normal (jamais encore lancé), pas une erreur de page.
  let run: ValidationRunSummary | undefined;
  try {
    run = await appApiFetch<ValidationRunSummary>(`/api/v1/tenders/${tenderId}/validation`);
  } catch (error) {
    if (!(error instanceof AppApiError) || error.status !== 404) {
      return <ApiErrorState error={error} />;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Validation" }]}
        title="Validation finale"
        description="Vérifie la conformité d'un aperçu avant approbation (pièces obligatoires, contenu non validé) et fige la version approuvée — jamais un contournement du contrôle bloquant."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/validation`} />
      <ValidationSection tenderId={tenderId} readiness={readiness} run={run} completedPreviews={exportHistory.items.filter((j) => j.status === "COMPLETED")} actorRole={actorRole} />
    </div>
  );
}
