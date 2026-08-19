import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { ChecklistFreshnessResult, ChecklistItem, ChecklistProgress, Tender, TenderLot } from "../../../../../../lib/tenders-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { ChecklistSection } from "../checklist-section";

export const metadata: Metadata = { title: "Checklist — TenderOS" };

/**
 * Checkpoint 2.1-A5 (wave 2, Tender Workspace) — même motif que /dce et /analysis : la Checklist
 * générique du Tender (mission §23/§29, distincte de la checklist ADMINISTRATIVE sous
 * administrative-dossier/checklist, jamais fusionnées — deux fonctionnalités réellement
 * différentes, voir le rapport de wave 1) devient un onglet canonique. Déplace `ChecklistSection`
 * (composant réutilisé tel quel) depuis la page hub — aucune fonctionnalité fusionnée ni supprimée.
 */
export default async function TenderChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let tender: Tender;
  let items: ChecklistItem[];
  let progress: ChecklistProgress | null;
  let lots: TenderLot[];
  let freshness: ChecklistFreshnessResult | null;

  try {
    [tender, items, progress, lots, freshness] = await Promise.all([
      appApiFetch<Tender>(`/api/v1/tenders/${tenderId}`),
      appApiFetch<ChecklistItem[]>(`/api/v1/tenders/${tenderId}/checklist`),
      appApiFetch<ChecklistProgress>(`/api/v1/tenders/${tenderId}/checklist/progress`).catch(() => null),
      appApiFetch<TenderLot[]>(`/api/v1/tenders/${tenderId}/lots`),
      // Checkpoint 2.1-P2.1-FIX-B — ne bloque jamais l'affichage de l'onglet : lecture seule,
      // dégradée à `null` (bandeau simplement absent) sur toute erreur inattendue.
      appApiFetch<ChecklistFreshnessResult>(`/api/v1/tenders/${tenderId}/checklist/freshness`).catch(() => null),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: tender.title, href: `/app/tenders/${tenderId}` }, { label: "Checklist" }]} title="Checklist" />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/checklist`} />
      <ChecklistSection tenderId={tenderId} items={items} lots={lots} progress={progress} freshness={freshness} />
    </div>
  );
}
