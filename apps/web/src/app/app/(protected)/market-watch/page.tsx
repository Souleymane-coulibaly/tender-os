import type { Metadata } from "next";
import { Alert, Card, EmptyState, PageHeader } from "../../../../components/ui";
import { getCurrentMembershipRole } from "../../../../lib/app-api-client";
import { canUseMarketWatch, type SavedSearchMatchSummary, type SavedSearchSummary } from "../../../../lib/market-watch-types";
import { fetchSavedSearches, fetchSavedSearchMatches } from "../../market-watch-actions";
import { ApiErrorState } from "../api-error-state";
import { CreateSavedSearchForm } from "./create-saved-search-form";
import { MatchCard } from "./match-card";
import { RunSavedSearchNowButton } from "./run-saved-search-now-button";
import { SavedSearchPanel } from "./saved-search-panel";

export const metadata: Metadata = { title: "Veille — TenderOS" };

export default async function MarketWatchPage({ searchParams }: { searchParams: Promise<{ searchId?: string; new?: string }> }) {
  const { searchId, new: showCreateForm } = await searchParams;

  let savedSearches: SavedSearchSummary[];
  let actorRole: string | undefined;
  try {
    [savedSearches, actorRole] = await Promise.all([fetchSavedSearches(), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (!canUseMarketWatch(actorRole)) {
    return <Alert tone="warning">Accès refusé : la veille est réservée aux membres actifs de l&apos;organisation.</Alert>;
  }

  const activeSearchId = searchId ?? savedSearches[0]?.id;
  const activeSearch = savedSearches.find((s) => s.id === activeSearchId);

  let matches: SavedSearchMatchSummary[] = [];
  let matchesError: unknown;
  if (activeSearchId) {
    try {
      const page = await fetchSavedSearchMatches(activeSearchId);
      matches = page.items;
    } catch (error) {
      matchesError = error;
    }
  }

  const isCreating = showCreateForm !== undefined || savedSearches.length === 0;
  /** Veille affichée dans l'en-tête : seulement quand ses marchés sont affichés (jamais pendant la création). */
  const headerSearch = isCreating ? undefined : activeSearch;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guideKey="market-watch"
        breadcrumb={[{ label: "Veille" }]}
        title={headerSearch ? headerSearch.name : "Veille"}
        description={
          headerSearch ? (
            <>
              {matches.length} marché{matches.length !== 1 ? "s" : ""} détecté{matches.length !== 1 ? "s" : ""}
              {!headerSearch.isActive ? " — veille désactivée" : ""}
            </>
          ) : undefined
        }
        // Checkpoint TENDEROS-2.1-P2.3-E10, mission §13.B — uniquement sur une veille ACTIVE
        // (mission §13.B "surface de configuration/détail d'une veille active").
        actions={headerSearch?.isActive ? <RunSavedSearchNowButton savedSearchId={headerSearch.id} /> : undefined}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <aside data-tour="guide-market-watch-saved-searches" className="shrink-0 md:w-72">
          <SavedSearchPanel savedSearches={savedSearches} activeSearchId={activeSearchId} />
        </aside>

        <div className="min-w-0 flex-1">
          {isCreating ? (
            <div data-tour="guide-market-watch-create-form">
              <Card title="Nouvelle veille">
                <CreateSavedSearchForm />
              </Card>
            </div>
          ) : activeSearch ? (
            matchesError ? (
              <ApiErrorState error={matchesError} />
            ) : matches.length === 0 ? (
              <EmptyState
                title={
                  activeSearch.isActive
                    ? "Aucun marché ne correspond encore à cette veille. La collecte s'exécute automatiquement toutes les heures — vous pouvez aussi cliquer sur « Tester la veille » ci-dessus pour une première recherche immédiate."
                    : "Cette veille est désactivée : réactivez-la pour reprendre la collecte automatique."
                }
              />
            ) : (
              <div data-tour="guide-market-watch-matches" className="flex flex-col gap-3">
                {matches.map((match) => (
                  <MatchCard key={match.id} match={match} savedSearchId={activeSearch.id} />
                ))}
              </div>
            )
          ) : (
            <EmptyState title="Sélectionnez une veille pour voir les marchés détectés." />
          )}
        </div>
      </div>
    </div>
  );
}
