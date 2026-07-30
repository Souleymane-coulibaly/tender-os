import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  knowledgeStatusBadgeClass,
  type KnowledgeCategory,
  type KnowledgeEntryStatus,
  type KnowledgeEntrySummary,
  type KnowledgePage,
  type KnowledgeTagSummary,
} from "../../../../lib/knowledge-types";
import { ApiErrorState } from "../api-error-state";
import { KnowledgeFilters } from "./knowledge-filters";

export const metadata: Metadata = { title: "Base de connaissances — TenderOS" };

type SearchParams = {
  cursor?: string;
  titleSearch?: string;
  category?: string;
  status?: string;
  includeArchived?: string;
};

export default async function KnowledgeBasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25", sort: "updatedAt", sortDirection: "desc" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.titleSearch) query.set("titleSearch", params.titleSearch);
  if (params.category) query.set("category", params.category);
  if (params.status) query.set("status", params.status);
  if (params.includeArchived === "true") query.set("includeArchived", "true");

  let page: KnowledgePage<KnowledgeEntrySummary>;
  let tags: KnowledgeTagSummary[];
  try {
    [page, tags] = await Promise.all([
      appApiFetch<KnowledgePage<KnowledgeEntrySummary>>(`/api/v1/knowledge/entries?${query.toString()}`),
      appApiFetch<KnowledgeTagSummary[]>("/api/v1/knowledge/tags"),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const topTags = tags.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Base de connaissances</h1>
          <p className="text-sm text-neutral-600">{page.total} entrée(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/knowledge/search" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
            Rechercher
          </Link>
          <Link href="/app/knowledge/import" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
            Importer un document
          </Link>
          <Link href="/app/knowledge/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Nouvelle entrée
          </Link>
        </div>
      </div>

      <KnowledgeFilters
        values={{
          titleSearch: params.titleSearch,
          category: params.category as KnowledgeCategory | undefined,
          status: params.status as KnowledgeEntryStatus | undefined,
          includeArchived: params.includeArchived === "true",
        }}
      />

      {topTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Tags fréquents :</span>
          {topTags.map((tag) => (
            <span key={tag.id} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
              {tag.displayLabel}
            </span>
          ))}
        </div>
      ) : null}

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune entrée à afficher.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Titre</th>
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Tags</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Documents</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Modifié le</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/knowledge/${entry.id}`} className="font-medium text-neutral-900 hover:underline">
                      {entry.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{KNOWLEDGE_CATEGORY_LABELS[entry.category]}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {entry.tags.length > 0 ? entry.tags.map((tag) => tag.displayLabel).join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${knowledgeStatusBadgeClass(entry.status)}`}>
                      {KNOWLEDGE_STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{entry.documentCount}</td>
                  <td className="py-2 pr-4 text-neutral-600">v{entry.activeVersionNumber}</td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(entry.updatedAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.nextCursor ? (
        <Link
          href={`/app/knowledge?${new URLSearchParams({ ...params, cursor: page.nextCursor }).toString()}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
