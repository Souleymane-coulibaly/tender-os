import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Checkbox, EmptyState, FieldWrapper, Input, PageHeader, Select } from "../../../../../components/ui";
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
      <mark className="rounded bg-warning-bg px-0.5 text-tenderos-navy">{snippet.slice(index, index + query.length)}</mark>
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
      <PageHeader
        breadcrumb={[{ label: "Base de connaissances", href: "/app/knowledge" }, { label: "Rechercher" }]}
        title="Rechercher dans la base de connaissances"
      />

      <Card padding="tight">
        <form method="GET" action="/app/knowledge/search" className="flex flex-wrap items-end gap-3">
          {/* `FieldWrapper` + contrôle nu : le libellé reste exactement « Recherche » (`Input required`
              ajouterait un astérisque). */}
          <FieldWrapper label="Recherche" className="min-w-[12rem] flex-1 sm:max-w-sm">
            <Input
              id="query"
              name="query"
              type="text"
              required
              defaultValue={params.query}
              placeholder="Nom de client, technologie, certification..."
            />
          </FieldWrapper>
          <Select label="Catégorie" id="category" name="category" defaultValue={params.category ?? ""} wrapperClassName="basis-52">
            <option value="">Toutes</option>
            {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Checkbox name="validatedOnly" value="true" defaultChecked={params.validatedOnly === "true"} label="Validées uniquement" className="pb-2.5" />
          <Button type="submit" variant="primary">
            Rechercher
          </Button>
        </form>
      </Card>

      {!query ? <EmptyState title="Saisissez une recherche pour consulter la base de connaissances." /> : null}

      {error ? <ApiErrorState error={error} /> : null}

      {results ? (
        results.items.length === 0 ? (
          <EmptyState title={<>Aucun résultat pour « {query} ».</>} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tenderos-slate">{results.total} résultat(s)</p>
            <ul className="flex flex-col gap-3">
              {results.items.map((item, index) => {
                const location = formatProvenanceLocation(item);
                return (
                  <li key={`${item.knowledgeEntryId}-${item.knowledgeDocumentId ?? "manual"}-${item.chunkSequence ?? index}`}>
                    <Card padding="tight">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-tenderos-navy">{item.title}</span>
                          <Badge>{KNOWLEDGE_CATEGORY_LABELS[item.category]}</Badge>
                          <span className="rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-slate">
                            {MATCH_LOCATION_LABELS[item.matchLocation] ?? item.matchLocation}
                          </span>
                        </div>
                        <span className="text-xs text-tenderos-slate">v{item.activeVersionNumber}</span>
                      </div>
                      {item.tags.length > 0 ? (
                        <p className="mt-1 text-xs text-tenderos-slate">{item.tags.join(", ")}</p>
                      ) : null}
                      <p className="mt-2 text-sm italic text-tenderos-navy">
                        &laquo;&nbsp;<HighlightedSnippet snippet={item.snippet} query={query ?? ""} />&nbsp;&raquo;
                      </p>
                      {location ? <p className="mt-1 text-xs text-tenderos-slate">Source : {location}</p> : null}
                      <div className="mt-2 flex items-center gap-3">
                        <Link href={`/app/knowledge/${item.knowledgeEntryId}`} className="text-xs font-medium text-tenderos-blue hover:underline">
                          Ouvrir l&apos;entrée
                        </Link>
                        {item.knowledgeDocumentId ? (
                          <Link
                            href={`/app/knowledge/${item.knowledgeEntryId}#document-${item.knowledgeDocumentId}`}
                            className="text-xs text-tenderos-slate hover:text-tenderos-navy hover:underline"
                          >
                            Voir la source
                          </Link>
                        ) : null}
                      </div>
                    </Card>
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
