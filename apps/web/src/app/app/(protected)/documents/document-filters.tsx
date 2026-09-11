import { Button, Card, Input, Select } from "../../../../components/ui";
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
    <Card padding="tight">
      <form method="GET" action="/app/documents" className="flex flex-wrap items-end gap-3">
        <Input
          label="Recherche"
          id="search"
          name="search"
          type="text"
          defaultValue={values.search}
          placeholder="Titre ou nom de fichier..."
          wrapperClassName="min-w-[12rem] flex-1 sm:max-w-xs"
        />
        <Select label="Statut" id="status" name="status" defaultValue={values.status ?? ""} wrapperClassName="basis-40">
          <option value="">Tous</option>
          {Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Origine" id="origin" name="origin" defaultValue={values.origin ?? ""} wrapperClassName="basis-48">
          <option value="">Toutes</option>
          {Object.entries(DOCUMENT_ORIGIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Domaine" id="domain" name="domain" defaultValue={values.domain ?? ""} wrapperClassName="basis-48">
          <option value="">Tous</option>
          {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit">Filtrer</Button>
      </form>
    </Card>
  );
}
