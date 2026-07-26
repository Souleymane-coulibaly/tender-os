import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import { TENDER_STATUS_LABELS, type PageResponse, type Tender, type TenderStatus } from "../../../../lib/tenders-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Appels d'offres — TenderOS" };

type SearchParams = {
  cursor?: string;
  search?: string;
  status?: string;
  internalOwnerId?: string;
  deadlineBefore?: string;
  sort?: string;
  sortDirection?: string;
};

function statusBadgeClass(status: TenderStatus): string {
  switch (status) {
    case "ARCHIVED":
      return "bg-neutral-200 text-neutral-700";
    case "LOST":
      return "bg-red-100 text-red-800";
    case "WON":
      return "bg-green-100 text-green-800";
    case "SUBMITTED":
    case "READY_TO_SUBMIT":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

export default async function TendersListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.internalOwnerId) query.set("internalOwnerId", params.internalOwnerId);
  if (params.deadlineBefore) query.set("deadlineBefore", new Date(params.deadlineBefore).toISOString());
  query.set("sort", params.sort ?? "createdAt");
  query.set("sortDirection", params.sortDirection ?? "desc");

  let page: PageResponse<Tender>;
  try {
    page = await appApiFetch<PageResponse<Tender>>(`/api/v1/tenders?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Appels d&apos;offres</h1>
        <Link
          href="/app/tenders/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Nouvel appel d&apos;offres
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="search" className="text-xs text-neutral-600">
            Recherche
          </label>
          <input
            id="search"
            name="search"
            type="text"
            defaultValue={params.search}
            placeholder="Titre, reference..."
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
            defaultValue={params.status ?? ""}
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
        <div className="flex flex-col gap-1">
          <label htmlFor="internalOwnerId" className="text-xs text-neutral-600">
            Responsable (ID)
          </label>
          <input
            id="internalOwnerId"
            name="internalOwnerId"
            type="text"
            defaultValue={params.internalOwnerId}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="deadlineBefore" className="text-xs text-neutral-600">
            Echeance avant le
          </label>
          <input
            id="deadlineBefore"
            name="deadlineBefore"
            type="date"
            defaultValue={params.deadlineBefore}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs text-neutral-600">
            Tri
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={params.sort ?? "createdAt"}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="createdAt">Date de creation</option>
            <option value="submissionDeadline">Echeance</option>
            <option value="title">Titre</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sortDirection" className="text-xs text-neutral-600">
            Ordre
          </label>
          <select
            id="sortDirection"
            name="sortDirection"
            defaultValue={params.sortDirection ?? "desc"}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="desc">Descendant</option>
            <option value="asc">Ascendant</option>
          </select>
        </div>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
          Filtrer
        </button>
      </form>

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun appel d&apos;offres a afficher.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 pr-4">Titre</th>
              <th className="py-2 pr-4">Acheteur</th>
              <th className="py-2 pr-4">Statut</th>
              <th className="py-2 pr-4">Echeance</th>
              <th className="py-2 pr-4">Cree le</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((tender) => (
              <tr key={tender.id} className="border-b border-neutral-100">
                <td className="py-2 pr-4">
                  <Link href={`/app/tenders/${tender.id}`} className="font-medium text-neutral-900 hover:underline">
                    {tender.title}
                  </Link>
                  {tender.reference ? <span className="ml-2 text-xs text-neutral-500">{tender.reference}</span> : null}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{tender.buyerName ?? "—"}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(tender.status)}`}>
                    {TENDER_STATUS_LABELS[tender.status]}
                  </span>
                </td>
                <td className="py-2 pr-4 text-neutral-600">
                  {tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{new Date(tender.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
