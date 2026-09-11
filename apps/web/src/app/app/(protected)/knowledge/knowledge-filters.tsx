import { Button, Card, Checkbox, Input, Select } from "../../../../components/ui";
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
    <Card padding="tight">
      <form method="GET" action="/app/knowledge" className="flex flex-wrap items-end gap-3">
        <Input
          label="Recherche par titre"
          id="titleSearch"
          name="titleSearch"
          type="text"
          defaultValue={values.titleSearch}
          placeholder="Titre..."
          wrapperClassName="min-w-[12rem] flex-1 sm:max-w-xs"
        />
        <Select label="Catégorie" id="category" name="category" defaultValue={values.category ?? ""} wrapperClassName="basis-52">
          <option value="">Toutes</option>
          {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Statut" id="status" name="status" defaultValue={values.status ?? ""} wrapperClassName="basis-44">
          <option value="">Tous</option>
          {Object.entries(KNOWLEDGE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {clients && clients.length > 0 ? (
          <Select label="Client" id="clientAccountId" name="clientAccountId" defaultValue={values.clientAccountId ?? ""} wrapperClassName="basis-64">
            <option value="">Toutes (globales + clients accessibles)</option>
            <option value="GLOBAL">Globales uniquement</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Checkbox name="includeArchived" value="true" defaultChecked={values.includeArchived} label="Inclure les archives" className="pb-2.5" />
        <Button type="submit">Filtrer</Button>
      </form>
    </Card>
  );
}
