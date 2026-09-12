"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../../../components/ui";
import type { SavedSearchSummary } from "../../../../lib/market-watch-types";
import { deleteSavedSearchAction, setSavedSearchStatusAction } from "../../market-watch-actions";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E3, mission §31/§32/§39 — pause/reprise/suppression : les actions
 * serveur existaient déjà (`setSavedSearchStatusAction`/`deleteSavedSearchAction`) mais n'étaient
 * câblées nulle part côté UI (audit initial). Badge "NEW" scopé PAR veille (jamais un compteur
 * global — mission §17/§39), fourni par le backend en une seule requête groupée.
 */
export function SavedSearchPanel({ savedSearches, activeSearchId }: { savedSearches: SavedSearchSummary[]; activeSearchId: string | undefined }) {
  return (
    <Card
      padding="tight"
      title="Mes veilles"
      actions={
        <span data-tour="guide-market-watch-new" className="flex">
          <Button variant="link" href="/app/market-watch?new" className="text-xs">
            + Nouvelle
          </Button>
        </span>
      }
    >
      {savedSearches.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune veille pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {savedSearches.map((search) => (
            <SavedSearchRow key={search.id} search={search} isActive={search.id === activeSearchId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SavedSearchRow({ search, isActive }: { search: SavedSearchSummary; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggleStatus() {
    startTransition(async () => {
      await setSavedSearchStatusAction(search.id, !search.isActive);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer la veille "${search.name}" ? Cette action est définitive.`)) return;
    startTransition(async () => {
      await deleteSavedSearchAction(search.id);
      router.refresh();
    });
  }

  return (
    <li className={`group flex items-center gap-1 rounded-lg ${isActive ? "bg-tenderos-navy" : "hover:bg-tenderos-light"}`}>
      <Link href={`/app/market-watch?searchId=${search.id}`} className={`min-w-0 flex-1 truncate px-3 py-2 text-sm ${isActive ? "text-white" : "text-tenderos-navy"}`}>
        {search.name}
        {!search.isActive ? <span className="ml-1.5 text-xs opacity-70">(en pause)</span> : null}
        {search.newMatchCount ? (
          <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${isActive ? "bg-white text-tenderos-navy" : "bg-danger-fg text-white"}`}>
            {search.newMatchCount}
          </span>
        ) : null}
      </Link>
      {/* Boutons natifs volontaires : leur couleur suit la ligne (blanc sur la veille active en
          navy), ce que les variantes de `Button` (texte navy/bleu imposé) rendraient illisible. */}
      <div className={`flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 ${isActive ? "text-white" : "text-tenderos-slate"}`}>
        <button
          type="button"
          disabled={isPending}
          onClick={handleToggleStatus}
          title={search.isActive ? "Mettre en pause" : "Réactiver"}
          className="rounded px-1 py-0.5 text-xs hover:underline disabled:opacity-50"
        >
          {search.isActive ? "Pause" : "Reprendre"}
        </button>
        <button type="button" disabled={isPending} onClick={handleDelete} title="Supprimer" className="rounded px-1 py-0.5 text-xs hover:underline disabled:opacity-50">
          Suppr.
        </button>
      </div>
    </li>
  );
}
