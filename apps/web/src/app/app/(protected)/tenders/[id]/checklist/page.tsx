import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchTenderSuggestions } from "../../../../ai-suggestion-actions";
import { canManageAiSuggestions, type AiSuggestion } from "../../../../../../lib/ai-suggestion-types";
import { AiSuggestionsSection } from "../ai-suggestions-section";
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
  let suggestions: AiSuggestion[];
  let role: string | undefined;

  try {
    [tender, items, progress, lots, freshness, suggestions, role] = await Promise.all([
      appApiFetch<Tender>(`/api/v1/tenders/${tenderId}`),
      appApiFetch<ChecklistItem[]>(`/api/v1/tenders/${tenderId}/checklist`),
      appApiFetch<ChecklistProgress>(`/api/v1/tenders/${tenderId}/checklist/progress`).catch(() => null),
      appApiFetch<TenderLot[]>(`/api/v1/tenders/${tenderId}/lots`),
      // Checkpoint 2.1-P2.1-FIX-B — ne bloque jamais l'affichage de l'onglet : lecture seule,
      // dégradée à `null` (bandeau simplement absent) sur toute erreur inattendue.
      appApiFetch<ChecklistFreshnessResult>(`/api/v1/tenders/${tenderId}/checklist/freshness`).catch(() => null),
      // « Comparer avec la dernière analyse » produit des SUGGESTIONS (jamais des éléments écrits
      // directement) : elles doivent se voir ICI, là où l'utilisateur a cliqué. Lecture dégradée
      // en liste vide plutôt que de bloquer l'onglet.
      fetchTenderSuggestions(tenderId).catch(() => [] as AiSuggestion[]),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: tender.title, href: `/app/tenders/${tenderId}` }, { label: "Checklist" }]} title="Checklist" />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/checklist`} />
      <ChecklistSection tenderId={tenderId} items={items} lots={lots} progress={progress} freshness={freshness} />
      <AiSuggestionsSection
        // Remonté quand la liste change (après `router.refresh()`), le panneau gardant sinon
        // l'état initial de son premier rendu.
        key={suggestions.map((suggestion) => suggestion.id).join(",")}
        tenderId={tenderId}
        initialSuggestions={suggestions}
        canManage={canManageAiSuggestions(role)}
        entityTypes={["CHECKLIST_ITEM"]}
        canGenerate={false}
      />
    </div>
  );
}
