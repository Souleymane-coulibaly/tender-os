import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../lib/app-api-client";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  formatProvenanceLocation,
  type KnowledgeSearchResult,
} from "../../../../../lib/knowledge-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Rechercher — Base de connaissances — TenderOS" };

type SearchParams = { query?: string; category?: string; validatedOnly?: string };

const MATCH_LOCATION_LABELS: Record<string, string> = {
  TITLE: "Titre",
  CONTENT: "Contenu",
  METADATA: "Métadonnées",
};

/** Surligne la requête dans l'extrait (mission §"surligner le passage trouvé si réalisable") —
 *  une mise en avant simple par sous-chaîne insensible à la casse, jamais un moteur de rendu
 *  markdown/HTML complet sur un contenu potentiellement confidentiel. */
function HighlightedSnippet({ snippet, query }: { snippet: string; query: string }) {
  const index = snippet.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return <>{snippet}</>;
  }
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-yellow-200 px-0.5">{snippet.slice(index, index + query.length)}</mark>
      {snippet.slice(index + query.length)}
    </>
  );
}

export default async function KnowledgeSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = params.query?.trim();

  let results: { items: KnowledgeSearchResult[]; total: number } | undefined;
  let error: unknown;
  if (query) {
    const searchQuery = new URLSearchParams({ query, limit: "20" });
    if (params.category) searchQuery.set("category", params.category);
    if (params.validatedOnly === "true") searchQuery.set("validatedOnly", "true");
    try {
      results = await appApiFetch<{ items: KnowledgeSearchResult[]; total: number }>(
        `/api/v1/knowledge/search?${searchQuery.toString()}`,
      );
    } catch (caught) {
      error = caught;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Rechercher dans la base de connaissances</h1>

      <form method="GET" action="/app/knowledge/search" className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="query" className="text-xs text-neutral-600">
            Recherche
          </label>
          <input
            id="query"
            name="query"
            type="text"
            required
            defaultValue={params.query}
            placeholder="Nom de client, technologie, certification..."
            className="w-72 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-neutral-600">
            Catégorie
          </label>
          <select id="category" name="category" defaultValue={params.category ?? ""} className="rounded border border-neutral-300 px-2 py-1 text-sm">
            <option value="">Toutes</option>
            {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-neutral-600">
          <input type="checkbox" name="validatedOnly" value="true" defaultChecked={params.validatedOnly === "true"} />
          Validées uniquement
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Rechercher
        </button>
      </form>

      {!query ? <p className="text-sm text-neutral-600">Saisissez une recherche pour consulter la base de connaissances.</p> : null}

      {error ? <ApiErrorState error={error} /> : null}

      {results ? (
        results.items.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun résultat pour « {query} ».</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">{results.total} résultat(s)</p>
            <ul className="flex flex-col gap-3">
              {results.items.map((item, index) => {
                const location = formatProvenanceLocation(item);
                return (
                  <li key={`${item.knowledgeEntryId}-${item.knowledgeDocumentId ?? "manual"}-${item.chunkSequence ?? index}`} className="rounded border border-neutral-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900">{item.title}</span>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                          {KNOWLEDGE_CATEGORY_LABELS[item.category]}
                        </span>
                        <span className="rounded bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-500">
                          {MATCH_LOCATION_LABELS[item.matchLocation] ?? item.matchLocation}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">v{item.activeVersionNumber}</span>
                    </div>
                    {item.tags.length > 0 ? (
                      <p className="mt-1 text-xs text-neutral-500">{item.tags.join(", ")}</p>
                    ) : null}
                    <p className="mt-2 text-sm italic text-neutral-700">
                      &laquo;&nbsp;<HighlightedSnippet snippet={item.snippet} query={query ?? ""} />&nbsp;&raquo;
                    </p>
                    {location ? <p className="mt-1 text-xs text-neutral-500">Source : {location}</p> : null}
                    <div className="mt-2 flex items-center gap-3">
                      <Link href={`/app/knowledge/${item.knowledgeEntryId}`} className="text-xs font-medium text-neutral-700 hover:underline">
                        Ouvrir l&apos;entrée
                      </Link>
                      {item.knowledgeDocumentId ? (
                        <Link
                          href={`/app/knowledge/${item.knowledgeEntryId}#document-${item.knowledgeDocumentId}`}
                          className="text-xs text-neutral-500 hover:underline"
                        >
                          Voir la source
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
