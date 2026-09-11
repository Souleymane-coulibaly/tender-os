import type { ClientAccountSummary } from "../../../../lib/client-portfolio-types";
import { TENDER_STATUS_LABELS, type TenderFiltersState } from "../../../../lib/tenders-types";

/**
 * Barre de filtres partagee entre la vue Liste et le Kanban (mission Kanban & List Views §9 :
 * "conservation des filtres entre les vues") — un simple formulaire GET, les memes noms de
 * parametres sont lus par les deux pages, donc l'URL reste la source de verite partagee.
 * Le filtre "recherche" est deliberement un simple champ texte cote UI : il est traduit
 * cote backend par TenderSearchProvider (application/ports/tender-search-provider.ts),
 * qui peut evoluer vers une recherche plein texte ou un classement IA sans que cette
 * interface n'ait besoin de changer.
 */
export function TenderFilters({
  basePath,
  values,
  sorting,
  clients,
}: {
  basePath: string;
  values: TenderFiltersState;
  /** Le tri n'a de sens que pour la vue Liste — le Kanban trie deja chaque colonne par
   *  echeance et n'affiche pas ce controle. */
  sorting?: { sort: string; sortDirection: string } | undefined;
  /** Clients ACCESSIBLES a l'acteur (deja filtres cote backend, mission Sprint 5.1
   *  §"un utilisateur standard ne voit que les clients auxquels il est affecte") — jamais
   *  une liste complete non filtree. */
  clients?: ClientAccountSummary[] | undefined;
}) {
  return (
    <form method="GET" action={basePath} className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="search" className="text-xs text-neutral-600">
          Recherche
        </label>
        <input
          id="search"
          name="search"
          type="text"
          defaultValue={values.search}
          placeholder="Titre, référence, acheteur..."
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
          {Object.entries(TENDER_STATUS_LABELS).map(([value, label]) => (
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
            <option value="">Tous</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="internalOwnerId" className="text-xs text-neutral-600">
          Responsable (ID)
        </label>
        <input
          id="internalOwnerId"
          name="internalOwnerId"
          type="text"
          defaultValue={values.internalOwnerId}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="deadlineAfter" className="text-xs text-neutral-600">
          Échéance après le
        </label>
        <input
          id="deadlineAfter"
          name="deadlineAfter"
          type="date"
          defaultValue={values.deadlineAfter?.slice(0, 10)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="deadlineBefore" className="text-xs text-neutral-600">
          Échéance avant le
        </label>
        <input
          id="deadlineBefore"
          name="deadlineBefore"
          type="date"
          defaultValue={values.deadlineBefore?.slice(0, 10)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <label className="flex items-center gap-1 pb-1.5 text-xs text-neutral-600">
        <input type="checkbox" name="overdue" value="true" defaultChecked={values.overdue} /> Echeance depassee
        uniquement
      </label>
      {sorting ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="sort" className="text-xs text-neutral-600">
              Tri
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sorting.sort}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="createdAt">Date de création</option>
              <option value="submissionDeadline">Échéance</option>
              <option value="title">Titre</option>
              <option value="updatedAt">Dernière modification</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sortDirection" className="text-xs text-neutral-600">
              Ordre
            </label>
            <select
              id="sortDirection"
              name="sortDirection"
              defaultValue={sorting.sortDirection}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="desc">Descendant</option>
              <option value="asc">Ascendant</option>
            </select>
          </div>
        </>
      ) : null}
      <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
        Filtrer
      </button>
    </form>
  );
}
