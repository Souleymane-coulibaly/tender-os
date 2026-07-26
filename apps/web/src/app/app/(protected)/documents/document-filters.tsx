import {
  DOCUMENT_DOMAIN_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentDomain,
  type DocumentOrigin,
  type DocumentStatus,
} from "../../../../lib/documents-types";

export type DocumentFiltersState = {
  search?: string | undefined;
  status?: DocumentStatus | undefined;
  origin?: DocumentOrigin | undefined;
  domain?: DocumentDomain | undefined;
};

/** Simple formulaire GET — memes conventions que TenderFilters (tenders/tender-filters.tsx) :
 *  l'URL reste la source de verite des filtres actifs. */
export function DocumentFilters({ values }: { values: DocumentFiltersState }) {
  return (
    <form
      method="GET"
      action="/app/documents"
      className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="search" className="text-xs text-neutral-600">
          Recherche
        </label>
        <input
          id="search"
          name="search"
          type="text"
          defaultValue={values.search}
          placeholder="Titre ou nom de fichier..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs text-neutral-600">
          Statut
        </label>
        <select
          id="status"
          name="status"
          defaultValue={values.status ?? ""}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">Tous</option>
          {Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="origin" className="text-xs text-neutral-600">
          Origine
        </label>
        <select
          id="origin"
          name="origin"
          defaultValue={values.origin ?? ""}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">Toutes</option>
          {Object.entries(DOCUMENT_ORIGIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="domain" className="text-xs text-neutral-600">
          Domaine
        </label>
        <select
          id="domain"
          name="domain"
          defaultValue={values.domain ?? ""}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">Tous</option>
          {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
        Filtrer
      </button>
    </form>
  );
}
