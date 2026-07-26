import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import type { PageResponse, TenderListItem, TenderStatistics as TenderStatisticsData } from "../../../../lib/tenders-types";
import { ApiErrorState } from "../api-error-state";
import { TenderFilters } from "./tender-filters";
import { TenderStatistics } from "./tender-statistics";
import { TenderStatusBadge } from "./tender-status-badge";
import { TenderViewSwitcher } from "./tender-view-switcher";

export const metadata: Metadata = { title: "Appels d'offres — TenderOS" };

type SearchParams = {
  cursor?: string;
  search?: string;
  status?: string;
  internalOwnerId?: string;
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
  if (params.deadlineAfter) query.set("deadlineAfter", new Date(params.deadlineAfter).toISOString());
  if (params.deadlineBefore) query.set("deadlineBefore", new Date(params.deadlineBefore).toISOString());
  if (params.overdue === "true") query.set("overdue", "true");
  query.set("sort", params.sort ?? "createdAt");
  query.set("sortDirection", params.sortDirection ?? "desc");

  let page: PageResponse<TenderListItem>;
  let stats: TenderStatisticsData;
  try {
    [page, stats] = await Promise.all([
      appApiFetch<PageResponse<TenderListItem>>(`/api/v1/tenders?${query.toString()}`),
      appApiFetch<TenderStatisticsData>("/api/v1/tenders/stats"),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const queryString = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Appels d&apos;offres</h1>
        <div className="flex items-center gap-3">
          <TenderViewSwitcher active="list" queryString={queryString} />
          <Link
            href="/app/tenders/new"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nouvel appel d&apos;offres
          </Link>
        </div>
      </div>

      <TenderStatistics stats={stats} />

      <TenderFilters
        basePath="/app/tenders"
        values={{
          search: params.search,
          status: params.status as TenderListItem["status"] | undefined,
          internalOwnerId: params.internalOwnerId,
          deadlineAfter: params.deadlineAfter,
          deadlineBefore: params.deadlineBefore,
          overdue: params.overdue === "true",
        }}
        sorting={{ sort: params.sort ?? "createdAt", sortDirection: params.sortDirection ?? "desc" }}
      />

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun appel d&apos;offres a afficher.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Objet</th>
                <th className="py-2 pr-4">Acheteur</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Date limite</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Risques</th>
                <th className="py-2 pr-4">Checklist</th>
                <th className="py-2 pr-4">Derniere modification</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((tender) => (
                <tr key={tender.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{tender.reference ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/tenders/${tender.id}`} className="font-medium text-neutral-900 hover:underline">
                      {tender.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{tender.buyerName ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <TenderStatusBadge status={tender.status} />
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {tender.submissionDeadline ? (
                      <span className={tender.overdue ? "font-medium text-red-700" : undefined}>
                        {new Date(tender.submissionDeadline).toLocaleDateString("fr-FR")}
                        {tender.overdue ? " (retard)" : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{tender.readinessScore}/100</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {tender.openRisksCount > 0 ? (
                      <span className="text-red-700">{tender.openRisksCount}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{tender.incompleteChecklistCount}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {new Date(tender.updatedAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/tenders/${tender.id}`} className="text-neutral-700 hover:underline">
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
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
