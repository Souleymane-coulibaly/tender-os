import type { ClientAccountSummary } from "../../../../lib/client-portfolio-types";
import { KNOWLEDGE_CATEGORY_LABELS, KNOWLEDGE_STATUS_LABELS, type KnowledgeCategory, type KnowledgeEntryStatus } from "../../../../lib/knowledge-types";

export type KnowledgeFiltersState = {
  titleSearch?: string | undefined;
  category?: KnowledgeCategory | undefined;
  status?: KnowledgeEntryStatus | undefined;
  includeArchived?: boolean | undefined;
  /** Mission Sprint 5.1 §"filtre client" — `"GLOBAL"` pour les entrées d'organisation, un id de
   *  client pour ses entrées spécifiques, absent pour tout ce qui est accessible. */
  clientAccountId?: string | undefined;
};

/** Meme motif GET que DocumentFilters (documents/document-filters.tsx) — l'URL reste la source
 *  de verite des filtres actifs (mission §"filtrer par categorie/tag/statut/date"). */
export function KnowledgeFilters({ values, clients }: { values: KnowledgeFiltersState; clients?: ClientAccountSummary[] | undefined }) {
  return (
    <form
      method="GET"
      action="/app/knowledge"
      className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="titleSearch" className="text-xs text-neutral-600">
          Recherche par titre
        </label>
        <input
          id="titleSearch"
          name="titleSearch"
          type="text"
          defaultValue={values.titleSearch}
          placeholder="Titre..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-xs text-neutral-600">
          Catégorie
        </label>
        <select id="category" name="category" defaultValue={values.category ?? ""} className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="">Toutes</option>
          {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs text-neutral-600">
          Statut
        </label>
        <select id="status" name="status" defaultValue={values.status ?? ""} className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="">Tous</option>
          {Object.entries(KNOWLEDGE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {clients && clients.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="clientAccountId" className="text-xs text-neutral-600">
            Client
          </label>
          <select
            id="clientAccountId"
            name="clientAccountId"
            defaultValue={values.clientAccountId ?? ""}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">Toutes (globales + clients accessibles)</option>
            <option value="GLOBAL">Globales uniquement</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="flex items-center gap-2 pb-1.5 text-xs text-neutral-600">
        <input type="checkbox" name="includeArchived" value="true" defaultChecked={values.includeArchived} />
        Inclure les archives
      </label>
      <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
        Filtrer
      </button>
    </form>
  );
}
