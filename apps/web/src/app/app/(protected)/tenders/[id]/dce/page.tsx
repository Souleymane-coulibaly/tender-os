import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchAnalysisCapabilities } from "../../../../analysis-actions";
import { canTriggerAnalysis, type AnalysisCapability } from "../../../../../../lib/analysis-types";
import { fetchDceSectionData } from "../../../../dce-actions";
import { canDeleteDceDocument, canImportOrReplaceDceDocument, type DceDocumentSummary, type DceSummary } from "../../../../../../lib/dce-types";
import type { Tender } from "../../../../../../lib/tenders-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { DceSection } from "../dce-section";

export const metadata: Metadata = { title: "DCE — TenderOS" };

/**
 * Checkpoint 2.1-A5 (wave 2, Tender Workspace) — le DCE (mission §25/§26/§27) devient un onglet
 * canonique, à parité avec Administratif/Chiffrage/Mémoire technique qui en disposaient déjà.
 * Déplace `DceSection` (composant réutilisé tel quel, jamais réécrit) depuis la page hub vers ici —
 * aucune fonctionnalité fusionnée ni supprimée, seulement relocalisée (mission "réduire la
 * superposition Vue d'ensemble", jamais un second mécanisme DCE).
 */
export default async function TenderDcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let tender: Tender;
  let dceSection: { dce: DceSummary | null; documents: DceDocumentSummary[] };
  let analysisCapabilities: AnalysisCapability[];
  let role: string | undefined;

  try {
    [tender, dceSection, analysisCapabilities, role] = await Promise.all([
      appApiFetch<Tender>(`/api/v1/tenders/${tenderId}`),
      fetchDceSectionData(tenderId),
      fetchAnalysisCapabilities(tenderId),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: tender.title, href: `/app/tenders/${tenderId}` }, { label: "DCE" }]} title="DCE" guideKey="tender-dce" />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/dce`} />
      {/* Guide de page : `Card` ne transmet pas `data-tour`, d'où l'enveloppe. */}
      <div data-tour="guide-tender-dce-section">
        <DceSection
          tenderId={tenderId}
          dce={dceSection.dce}
          documents={dceSection.documents}
          canManage={canImportOrReplaceDceDocument(role)}
          canDelete={canDeleteDceDocument(role)}
          canAnalyze={canTriggerAnalysis(role)}
          analysisCapability={analysisCapabilities.find((c) => c.taskType === "ANALYZE_DOCUMENT")}
        />
      </div>
    </div>
  );
}
