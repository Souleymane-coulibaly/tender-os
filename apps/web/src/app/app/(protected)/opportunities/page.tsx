import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { appApiFetch } from "../../../../lib/app-api-client";
import { OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_TONE, type Opportunity, type OpportunityStatus } from "../../../../lib/opportunity-types";
import type { PageResponse } from "../../../../lib/tenders-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Opportunités — TenderOS" };

type SearchParams = { cursor?: string; status?: string };

/** Filtre de statut : l'actif est plein (navy), les autres discrets — liens de navigation (URL),
 *  jamais des boutons d'action, donc hors `Button` (un seul `primary` par écran). */
function filterClasses(active: boolean): string {
  return `rounded-lg px-2 py-1 font-medium transition ${active ? "bg-tenderos-navy text-white" : "border border-tenderos-navy/15 text-tenderos-slate hover:bg-tenderos-light"}`;
}

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
      <PageHeader
        guideKey="opportunities"
        breadcrumb={[{ label: "Opportunités" }]}
        title="Opportunités"
        description="Préqualification avant création d'un appel d'offres — score, décision, puis promotion."
        actions={
          <div data-tour="guide-opportunities-create" className="flex">
            <Button href="/app/opportunities/new" variant="primary">
              Nouvelle opportunité
            </Button>
          </div>
        }
      />

      <div data-tour="guide-opportunities-filters" className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/opportunities" className={filterClasses(!params.status)}>
          Toutes
        </Link>
        {(Object.keys(OPPORTUNITY_STATUS_LABELS) as OpportunityStatus[]).map((status) => (
          <Link key={status} href={`/app/opportunities?status=${status}`} className={filterClasses(params.status === status)}>
            {OPPORTUNITY_STATUS_LABELS[status]}
          </Link>
        ))}
      </div>

      <div data-tour="guide-opportunities-list">
      {page.items.length === 0 ? (
        <EmptyState title="Aucune opportunité à afficher." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Titre</TableHeaderCell>
              <TableHeaderCell>Acheteur</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Date limite</TableHeaderCell>
              <TableHeaderCell>Dernière modification</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((opportunity) => (
              <TableRow key={opportunity.id}>
                <TableCell>
                  <Link href={`/app/opportunities/${opportunity.id}`} className="font-medium text-tenderos-navy hover:underline">
                    {opportunity.title}
                  </Link>
                </TableCell>
                <TableCell className="text-tenderos-slate">{opportunity.buyerName ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone={OPPORTUNITY_STATUS_TONE[opportunity.status]}>{OPPORTUNITY_STATUS_LABELS[opportunity.status]}</Badge>
                </TableCell>
                <TableCell className="text-tenderos-slate">
                  {opportunity.submissionDeadline ? new Date(opportunity.submissionDeadline).toLocaleDateString("fr-FR") : "—"}
                </TableCell>
                <TableCell className="text-tenderos-slate">{new Date(opportunity.updatedAt).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  <Link href={`/app/opportunities/${opportunity.id}`} className="text-tenderos-blue hover:underline">
                    Ouvrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      </div>

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Button
          href={`/app/opportunities?${new URLSearchParams({ ...params, cursor: page.pageInfo.nextCursor }).toString()}`}
          variant="link"
          className="self-start text-sm"
        >
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
