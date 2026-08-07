import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import { OPPORTUNITY_STATUS_BADGE_CLASSES, OPPORTUNITY_STATUS_LABELS, type Opportunity, type OpportunityStatus } from "../../../../lib/opportunity-types";
import type { PageResponse } from "../../../../lib/tenders-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Opportunités — TenderOS" };

type SearchParams = { cursor?: string; status?: string };

export default async function OpportunitiesListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.status) query.set("status", params.status);

  let page: PageResponse<Opportunity>;
  try {
    page = await appApiFetch<PageResponse<Opportunity>>(`/api/v1/opportunities?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opportunités</h1>
          <p className="text-sm text-neutral-600">Préqualification avant création d&apos;un appel d&apos;offres — score, décision, puis promotion.</p>
        </div>
        <Link href="/app/opportunities/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Nouvelle opportunité
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/opportunities" className={`rounded px-2 py-1 ${!params.status ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}>
          Toutes
        </Link>
        {(Object.keys(OPPORTUNITY_STATUS_LABELS) as OpportunityStatus[]).map((status) => (
          <Link
            key={status}
            href={`/app/opportunities?status=${status}`}
            className={`rounded px-2 py-1 ${params.status === status ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
          >
            {OPPORTUNITY_STATUS_LABELS[status]}
          </Link>
        ))}
      </div>

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune opportunité à afficher.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Titre</th>
                <th className="py-2 pr-4">Acheteur</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Date limite</th>
                <th className="py-2 pr-4">Dernière modification</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((opportunity) => (
                <tr key={opportunity.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/opportunities/${opportunity.id}`} className="font-medium text-neutral-900 hover:underline">
                      {opportunity.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{opportunity.buyerName ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${OPPORTUNITY_STATUS_BADGE_CLASSES[opportunity.status]}`}>
                      {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {opportunity.submissionDeadline ? new Date(opportunity.submissionDeadline).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(opportunity.updatedAt).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/opportunities/${opportunity.id}`} className="text-neutral-700 hover:underline">
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
          href={`/app/opportunities?${new URLSearchParams({ ...params, cursor: page.pageInfo.nextCursor }).toString()}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
