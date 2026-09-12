import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { appApiFetch } from "../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../lib/client-portfolio-types";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_STATUS_LABELS,
  KNOWLEDGE_STATUS_TONE,
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
  clientAccountId?: string;
};

export default async function KnowledgeBasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25", sort: "updatedAt", sortDirection: "desc" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.titleSearch) query.set("titleSearch", params.titleSearch);
  if (params.category) query.set("category", params.category);
  if (params.status) query.set("status", params.status);
  if (params.includeArchived === "true") query.set("includeArchived", "true");
  if (params.clientAccountId) query.set("clientAccountId", params.clientAccountId);

  let page: KnowledgePage<KnowledgeEntrySummary>;
  let tags: KnowledgeTagSummary[];
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  try {
    [page, tags, clients] = await Promise.all([
      appApiFetch<KnowledgePage<KnowledgeEntrySummary>>(`/api/v1/knowledge/entries?${query.toString()}`),
      appApiFetch<KnowledgeTagSummary[]>("/api/v1/knowledge/tags"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100"),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const clientNameById = new Map(clients.items.map((client) => [client.id, client.name]));

  const topTags = tags.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        guideKey="knowledge"
        breadcrumb={[{ label: "Base de connaissances" }]}
        title="Base de connaissances"
        description={`${page.total} entrée(s)`}
        actions={
          <>
            <div data-tour="guide-knowledge-search" className="flex">
              <Button href="/app/knowledge/search">Rechercher</Button>
            </div>
            <div data-tour="guide-knowledge-import" className="flex">
              <Button href="/app/knowledge/import">Importer un document</Button>
            </div>
            <div data-tour="guide-knowledge-create" className="flex">
              <Button href="/app/knowledge/new" variant="primary">
                Nouvelle entrée
              </Button>
            </div>
          </>
        }
      />

      <div data-tour="guide-knowledge-filters">
      <KnowledgeFilters
        values={{
          titleSearch: params.titleSearch,
          category: params.category as KnowledgeCategory | undefined,
          status: params.status as KnowledgeEntryStatus | undefined,
          includeArchived: params.includeArchived === "true",
          clientAccountId: params.clientAccountId,
        }}
        clients={clients.items}
      />
      </div>

      {topTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-tenderos-slate">Tags fréquents :</span>
          {topTags.map((tag) => (
            <Badge key={tag.id}>{tag.displayLabel}</Badge>
          ))}
        </div>
      ) : null}

      <div data-tour="guide-knowledge-list">
      {page.items.length === 0 ? (
        <EmptyState title="Aucune entrée à afficher." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Titre</TableHeaderCell>
              <TableHeaderCell>Portée</TableHeaderCell>
              <TableHeaderCell>Catégorie</TableHeaderCell>
              <TableHeaderCell>Tags</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Documents</TableHeaderCell>
              <TableHeaderCell>Version</TableHeaderCell>
              <TableHeaderCell>Modifié le</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Link href={`/app/knowledge/${entry.id}`} className="font-medium text-tenderos-navy hover:underline">
                    {entry.title}
                  </Link>
                </TableCell>
                <TableCell>
                  {entry.clientAccountId ? (
                    <Badge tone="info">{clientNameById.get(entry.clientAccountId) ?? "Client"}</Badge>
                  ) : (
                    <Badge>Globale</Badge>
                  )}
                </TableCell>
                <TableCell className="text-tenderos-slate">{KNOWLEDGE_CATEGORY_LABELS[entry.category]}</TableCell>
                <TableCell className="text-tenderos-slate">
                  {entry.tags.length > 0 ? entry.tags.map((tag) => tag.displayLabel).join(", ") : "—"}
                </TableCell>
                <TableCell>
                  <Badge tone={KNOWLEDGE_STATUS_TONE[entry.status] ?? "neutral"}>{KNOWLEDGE_STATUS_LABELS[entry.status]}</Badge>
                </TableCell>
                <TableCell className="text-tenderos-slate">{entry.documentCount}</TableCell>
                <TableCell className="text-tenderos-slate">v{entry.activeVersionNumber}</TableCell>
                <TableCell className="text-tenderos-slate">{new Date(entry.updatedAt).toLocaleDateString("fr-FR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </div>

      {page.nextCursor ? (
        <Button variant="link" href={`/app/knowledge?${new URLSearchParams({ ...params, cursor: page.nextCursor }).toString()}`} className="self-start">
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
