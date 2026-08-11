import Link from "next/link";
import type { SavedSearchSummary } from "../../../../lib/market-watch-types";

/** Mission §89/§90 — panneau des veilles sauvegardées. */
export function SavedSearchPanel({ savedSearches, activeSearchId }: { savedSearches: SavedSearchSummary[]; activeSearchId: string | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Mes veilles</h2>
        <Link href="/app/market-watch?new" className="text-xs font-medium text-neutral-900 hover:underline">
          + Nouvelle
        </Link>
      </div>
      {savedSearches.length === 0 ? (
        <p className="text-xs text-neutral-500">Aucune veille pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {savedSearches.map((search) => (
            <li key={search.id}>
              <Link
                href={`/app/market-watch?searchId=${search.id}`}
                className={`block rounded px-3 py-2 text-sm ${search.id === activeSearchId ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
              >
                {search.name}
                {!search.isActive ? <span className="ml-1.5 text-xs opacity-70">(désactivée)</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
