import { CLIENT_ACCOUNT_STATUS_LABELS, type ClientAccountStatus } from "../../../../lib/client-portfolio-types";

export type ClientFiltersState = {
  nameSearch?: string | undefined;
  status?: ClientAccountStatus | undefined;
  includeArchived?: boolean | undefined;
};

/** Même motif GET que KnowledgeFilters/DocumentFilters — l'URL reste la source de vérité des
 *  filtres actifs. */
export function ClientFilters({ values }: { values: ClientFiltersState }) {
  return (
    <form method="GET" action="/app/clients" className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="nameSearch" className="text-xs text-neutral-600">
          Recherche par nom
        </label>
        <input
          id="nameSearch"
          name="nameSearch"
          type="text"
          defaultValue={values.nameSearch}
          placeholder="Nom du client..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs text-neutral-600">
          Statut
        </label>
        <select id="status" name="status" defaultValue={values.status ?? ""} className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="">Tous</option>
          {Object.entries(CLIENT_ACCOUNT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-1.5 text-xs text-neutral-600">
        <input type="checkbox" name="includeArchived" value="true" defaultChecked={values.includeArchived} />
        Inclure les clients archivés
      </label>
      <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
        Filtrer
      </button>
    </form>
  );
}
