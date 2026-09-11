import { Button, Card, Checkbox, Input, Select } from "../../../../components/ui";
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
    <Card padding="tight">
      <form method="GET" action={basePath} className="flex flex-wrap items-end gap-3">
        <Input
          label="Recherche"
          id="search"
          name="search"
          type="text"
          defaultValue={values.search}
          placeholder="Titre, référence, acheteur..."
          wrapperClassName="min-w-[12rem] flex-1 sm:max-w-xs"
        />
        <Select label="Statut" id="status" name="status" defaultValue={values.status ?? ""} wrapperClassName="basis-44">
          <option value="">Tous</option>
          {Object.entries(TENDER_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {clients && clients.length > 0 ? (
          <Select
            label="Client"
            id="clientAccountId"
            name="clientAccountId"
            defaultValue={values.clientAccountId ?? ""}
            wrapperClassName="basis-44"
          >
            <option value="">Tous</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          label="Responsable (ID)"
          id="internalOwnerId"
          name="internalOwnerId"
          type="text"
          defaultValue={values.internalOwnerId}
          wrapperClassName="basis-40"
        />
        <Input
          label="Échéance après le"
          id="deadlineAfter"
          name="deadlineAfter"
          type="date"
          defaultValue={values.deadlineAfter?.slice(0, 10)}
          wrapperClassName="basis-40"
        />
        <Input
          label="Échéance avant le"
          id="deadlineBefore"
          name="deadlineBefore"
          type="date"
          defaultValue={values.deadlineBefore?.slice(0, 10)}
          wrapperClassName="basis-40"
        />
        <Checkbox name="overdue" value="true" defaultChecked={values.overdue} label="Echeance depassee uniquement" className="pb-2.5" />
        {sorting ? (
          <>
            <Select label="Tri" id="sort" name="sort" defaultValue={sorting.sort} wrapperClassName="basis-44">
              <option value="createdAt">Date de création</option>
              <option value="submissionDeadline">Échéance</option>
              <option value="title">Titre</option>
              <option value="updatedAt">Dernière modification</option>
            </Select>
            <Select label="Ordre" id="sortDirection" name="sortDirection" defaultValue={sorting.sortDirection} wrapperClassName="basis-36">
              <option value="desc">Descendant</option>
              <option value="asc">Ascendant</option>
            </Select>
          </>
        ) : null}
        <Button type="submit">Filtrer</Button>
      </form>
    </Card>
  );
}
