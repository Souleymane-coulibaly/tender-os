import { Button, Card, Checkbox, Input, Select } from "../../../../components/ui";
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
    <Card padding="tight">
      <form method="GET" action="/app/clients" className="flex flex-wrap items-end gap-3">
        <Input
          label="Recherche par nom"
          id="nameSearch"
          name="nameSearch"
          type="text"
          defaultValue={values.nameSearch}
          placeholder="Nom du client..."
          wrapperClassName="min-w-[12rem] flex-1 sm:max-w-xs"
        />
        <Select label="Statut" id="status" name="status" defaultValue={values.status ?? ""} wrapperClassName="basis-40">
          <option value="">Tous</option>
          {Object.entries(CLIENT_ACCOUNT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Checkbox name="includeArchived" value="true" defaultChecked={values.includeArchived} label="Inclure les clients archivés" className="pb-2.5" />
        <Button type="submit">Filtrer</Button>
      </form>
    </Card>
  );
}
