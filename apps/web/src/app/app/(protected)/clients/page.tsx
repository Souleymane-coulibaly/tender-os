import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import {
  CLIENT_ACCOUNT_STATUS_LABELS,
  clientAccountStatusBadgeClass,
  type ClientAccountStatus,
  type ClientAccountSummary,
  type ClientPortfolioPage,
} from "../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../api-error-state";
import { ClientFilters } from "./client-filters";

export const metadata: Metadata = { title: "Clients — TenderOS" };

type SearchParams = {
  cursor?: string;
  nameSearch?: string;
  status?: string;
  includeArchived?: string;
};

export default async function ClientsListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.nameSearch) query.set("nameSearch", params.nameSearch);
  if (params.status) query.set("status", params.status);
  if (params.includeArchived === "true") query.set("includeArchived", "true");

  let page: ClientPortfolioPage<ClientAccountSummary>;
  try {
    page = await appApiFetch<ClientPortfolioPage<ClientAccountSummary>>(`/api/v1/clients?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Clients</h1>
          <p className="text-sm text-neutral-600">{page.total} client(s)</p>
        </div>
        <Link href="/app/clients/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Nouveau client
        </Link>
      </div>

      <ClientFilters
        values={{
          nameSearch: params.nameSearch,
          status: params.status as ClientAccountStatus | undefined,
          includeArchived: params.includeArchived === "true",
        }}
      />

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">
          {params.nameSearch || params.status
            ? "Aucun client ne correspond à ces filtres."
            : "Aucun client accessible. Un administrateur peut en créer un ou vous affecter à un client existant."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Raison sociale</th>
                <th className="py-2 pr-4">Secteur</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Modifié le</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((client) => (
                <tr key={client.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/clients/${client.id}`} className="font-medium text-neutral-900 hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{client.legalName ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{client.sector ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${clientAccountStatusBadgeClass(client.status)}`}>
                      {CLIENT_ACCOUNT_STATUS_LABELS[client.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(client.updatedAt).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/clients/${client.id}`} className="text-neutral-700 hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.nextCursor ? (
        <Link
          href={`/app/clients?${new URLSearchParams({ ...params, cursor: page.nextCursor }).toString()}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
