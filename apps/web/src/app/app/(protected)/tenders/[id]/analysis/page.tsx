import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchAnalysisSectionData } from "../../../../analysis-actions";
import { canTriggerAnalysis, type AnalysisSectionData } from "../../../../../../lib/analysis-types";
import type { Tender } from "../../../../../../lib/tenders-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { AnalysisSection } from "../analysis-section";

export const metadata: Metadata = { title: "Analyse — TenderOS" };

/**
 * Checkpoint 2.1-A5 (wave 2, Tender Workspace) — même motif que /dce : l'Analyse (mission §28)
 * devient un onglet canonique, positionné juste après DCE (dépendance réelle — l'analyse porte sur
 * les documents DCE déjà importés). Déplace `AnalysisSection` (composant réutilisé tel quel) depuis
 * la page hub vers ici — aucune fonctionnalité fusionnée ni supprimée, seulement relocalisée.
 */
export default async function TenderAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let tender: Tender;
  let analysisData: AnalysisSectionData;
  let role: string | undefined;

  try {
    [tender, analysisData, role] = await Promise.all([
      appApiFetch<Tender>(`/api/v1/tenders/${tenderId}`),
      fetchAnalysisSectionData(tenderId),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: tender.title, href: `/app/tenders/${tenderId}` }, { label: "Analyse" }]} title="Analyse" guideKey="tender-analysis" />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/analysis`} />
      <AnalysisSection tenderId={tenderId} initialData={analysisData} canTrigger={canTriggerAnalysis(role)} />
    </div>
  );
}
