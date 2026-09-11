import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { appApiFetch } from "../../../../lib/app-api-client";
import {
  CLIENT_ACCOUNT_STATUS_LABELS,
  CLIENT_ACCOUNT_STATUS_TONE,
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
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Clients" }]}
        title="Clients"
        description={`${page.total} client(s)`}
        actions={
          <Button href="/app/clients/new" variant="primary">
            Nouveau client
          </Button>
        }
      />

      <ClientFilters
        values={{
          nameSearch: params.nameSearch,
          status: params.status as ClientAccountStatus | undefined,
          includeArchived: params.includeArchived === "true",
        }}
      />

      {page.items.length === 0 ? (
        <EmptyState
          title={
            params.nameSearch || params.status
              ? "Aucun client ne correspond à ces filtres."
              : "Aucun client accessible. Un administrateur peut en créer un ou vous affecter à un client existant."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nom</TableHeaderCell>
              <TableHeaderCell>Raison sociale</TableHeaderCell>
              <TableHeaderCell>Secteur</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Modifié le</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/app/clients/${client.id}`} className="font-medium text-tenderos-navy hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-tenderos-slate">{client.legalName ?? "—"}</TableCell>
                <TableCell className="text-tenderos-slate">{client.sector ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone={CLIENT_ACCOUNT_STATUS_TONE[client.status] ?? "neutral"}>{CLIENT_ACCOUNT_STATUS_LABELS[client.status]}</Badge>
                </TableCell>
                <TableCell className="text-tenderos-slate">{new Date(client.updatedAt).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  <Link href={`/app/clients/${client.id}`} className="text-tenderos-blue hover:underline">
                    Ouvrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {page.nextCursor ? (
        <Button variant="link" href={`/app/clients?${new URLSearchParams({ ...params, cursor: page.nextCursor }).toString()}`} className="self-start">
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
