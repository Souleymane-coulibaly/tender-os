import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { PageHeader } from "../../../../components/ui/page-header";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../lib/client-portfolio-types";
import type { PageResponse, TenderListItem, TenderStatistics as TenderStatisticsData } from "../../../../lib/tenders-types";
import { ApiErrorState } from "../api-error-state";
import { TenderFilters } from "./tender-filters";
import { TenderStatistics } from "./tender-statistics";
import { TenderStatusBadge } from "./tender-status-badge";
import { TenderViewSwitcher } from "./tender-view-switcher";

const FOLDER_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM9 13h6M9 17h6" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const metadata: Metadata = { title: "Appels d'offres — TenderOS" };

type SearchParams = {
  cursor?: string;
  search?: string;
  status?: string;
  internalOwnerId?: string;
  clientAccountId?: string;
  deadlineAfter?: string;
  deadlineBefore?: string;
  overdue?: string;
  sort?: string;
  sortDirection?: string;
};

export default async function TendersListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.internalOwnerId) query.set("internalOwnerId", params.internalOwnerId);
  if (params.clientAccountId) query.set("clientAccountId", params.clientAccountId);
  if (params.deadlineAfter) query.set("deadlineAfter", new Date(params.deadlineAfter).toISOString());
  if (params.deadlineBefore) query.set("deadlineBefore", new Date(params.deadlineBefore).toISOString());
  if (params.overdue === "true") query.set("overdue", "true");
  query.set("sort", params.sort ?? "createdAt");
  query.set("sortDirection", params.sortDirection ?? "desc");

  let page: PageResponse<TenderListItem>;
  let stats: TenderStatisticsData;
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  try {
    [page, stats, clients] = await Promise.all([
      appApiFetch<PageResponse<TenderListItem>>(`/api/v1/tenders?${query.toString()}`),
      appApiFetch<TenderStatisticsData>("/api/v1/tenders/stats"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100"),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const clientNameById = new Map(clients.items.map((client) => [client.id, client.name]));

  const queryString = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Appels d'offres"
        description="Retrouvez ici vos dossiers en préparation et finalisés."
        actions={
          <>
            <TenderViewSwitcher active="list" queryString={queryString} />
            <Button href="/app/tenders/new" variant="primary">
              Nouvel appel d&apos;offres
            </Button>
          </>
        }
      />

      <TenderStatistics stats={stats} />

      <TenderFilters
        basePath="/app/tenders"
        values={{
          search: params.search,
          status: params.status as TenderListItem["status"] | undefined,
          internalOwnerId: params.internalOwnerId,
          clientAccountId: params.clientAccountId,
          deadlineAfter: params.deadlineAfter,
          deadlineBefore: params.deadlineBefore,
          overdue: params.overdue === "true",
        }}
        sorting={{ sort: params.sort ?? "createdAt", sortDirection: params.sortDirection ?? "desc" }}
        clients={clients.items}
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={FOLDER_ICON}
          title="Aucun appel d'offres pour le moment"
          description="Importez votre premier DCE ou explorez les opportunités détectées par TenderOS."
          actions={
            <>
              <Button href="/app/tenders/new" variant="primary">
                Importer un DCE
              </Button>
              <Button href="/app/market-watch" variant="secondary">
                Explorer les opportunités
              </Button>
            </>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-tenderos-navy/10 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-tenderos-slate">
                <th className="px-4 py-3 font-medium">Référence</th>
                <th className="px-4 py-3 font-medium">Objet</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Acheteur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Date limite</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Risques</th>
                <th className="px-4 py-3 font-medium">Checklist</th>
                <th className="px-4 py-3 font-medium">Dernière modification</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((tender) => (
                <tr key={tender.id} className="border-b border-tenderos-navy/5 last:border-b-0 hover:bg-tenderos-light/60">
                  <td className="px-4 py-3 text-tenderos-slate">{tender.reference ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/app/tenders/${tender.id}`} className="font-semibold text-tenderos-navy hover:text-tenderos-blue hover:underline">
                      {tender.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tenderos-slate">
                    {clientNameById.get(tender.clientAccountId) ?? (
                      <Link href={`/app/clients/${tender.clientAccountId}`} className="hover:underline">
                        Voir le client
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tenderos-slate">{tender.buyerName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <TenderStatusBadge status={tender.status} />
                  </td>
                  <td className="px-4 py-3 text-tenderos-slate">
                    {tender.submissionDeadline ? (
                      <span className={tender.overdue ? "font-semibold text-red-700" : undefined}>
                        {new Date(tender.submissionDeadline).toLocaleDateString("fr-FR")}
                        {tender.overdue ? " (retard)" : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-tenderos-slate">{tender.readinessScore}/100</td>
                  <td className="px-4 py-3 tabular-nums text-tenderos-slate">
                    {tender.openRisksCount > 0 ? (
                      <span className="font-semibold text-red-700">{tender.openRisksCount}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-tenderos-slate">{tender.incompleteChecklistCount}</td>
                  <td className="px-4 py-3 text-tenderos-slate">
                    {new Date(tender.updatedAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/app/tenders/${tender.id}`} className="font-medium text-tenderos-blue hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Link
          href={`/app/tenders?${new URLSearchParams({ ...params, cursor: page.pageInfo.nextCursor }).toString()}`}
          className="self-start text-sm font-medium text-tenderos-blue hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
