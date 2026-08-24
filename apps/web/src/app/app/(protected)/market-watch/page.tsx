import type { Metadata } from "next";
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
    return (
      <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Accès refusé : la veille est réservée aux membres actifs de l&apos;organisation.
      </div>
    );
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

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <aside className="shrink-0 md:w-72">
        <SavedSearchPanel savedSearches={savedSearches} activeSearchId={activeSearchId} />
      </aside>

      <div className="min-w-0 flex-1">
        {showCreateForm !== undefined || savedSearches.length === 0 ? (
          <section className="rounded border border-neutral-200 p-4">
            <h2 className="mb-3 text-sm font-semibold">Nouvelle veille</h2>
            <CreateSavedSearchForm />
          </section>
        ) : activeSearch ? (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">{activeSearch.name}</h1>
                <p className="text-sm text-neutral-600">
                  {matches.length} marché{matches.length !== 1 ? "s" : ""} détecté{matches.length !== 1 ? "s" : ""}
                  {!activeSearch.isActive ? " — veille désactivée" : ""}
                </p>
              </div>
              {/* Checkpoint TENDEROS-2.1-P2.3-E10, mission §13.B — uniquement sur une veille ACTIVE
                  (mission §13.B "surface de configuration/détail d'une veille active"). */}
              {activeSearch.isActive ? <RunSavedSearchNowButton savedSearchId={activeSearch.id} /> : null}
            </div>
            {matchesError ? (
              <ApiErrorState error={matchesError} />
            ) : matches.length === 0 ? (
              <p className="text-sm text-neutral-600">
                {activeSearch.isActive
                  ? "Aucun marché ne correspond encore à cette veille. La collecte s'exécute automatiquement toutes les heures — vous pouvez aussi cliquer sur « Tester la veille » ci-dessus pour une première recherche immédiate."
                  : "Cette veille est désactivée : réactivez-la pour reprendre la collecte automatique."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {matches.map((match) => (
                  <MatchCard key={match.id} match={match} savedSearchId={activeSearch.id} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <p className="text-sm text-neutral-600">Sélectionnez une veille pour voir les marchés détectés.</p>
        )}
      </div>
    </div>
  );
}
