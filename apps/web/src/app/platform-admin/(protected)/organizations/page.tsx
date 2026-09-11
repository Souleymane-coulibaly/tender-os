import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type BadgeTone,
} from "../../../../components/ui";
import { platformApiFetch } from "../../../../lib/platform-api-client";
import type { PageResponse, PlatformOrganization } from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Organisations — Platform Admin — TenderOS" };

/** Ton `Badge` d'un statut d'organisation (remplace l'ancien `statusBadgeClass()` local). */
const ORGANIZATION_STATUS_TONE: Record<PlatformOrganization["status"], BadgeTone> = {
  TRIAL: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};

const BREADCRUMB = [{ label: "Back-office", href: "/platform-admin" }, { label: "Organisations" }];

export default async function PlatformAdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=25` : "?limit=25";

  let page: PageResponse<PlatformOrganization>;

  try {
    page = await platformApiFetch<PageResponse<PlatformOrganization>>(`/api/v1/admin/organizations${query}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (page.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={BREADCRUMB} title="Organisations" />
        <EmptyState title="Aucune organisation à afficher." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={BREADCRUMB} title="Organisations" />
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Nom</TableHeaderCell>
            <TableHeaderCell>Slug</TableHeaderCell>
            <TableHeaderCell>Statut</TableHeaderCell>
            <TableHeaderCell>Membres actifs</TableHeaderCell>
            <TableHeaderCell>Créée le</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {page.items.map((organization) => (
            <TableRow key={organization.id}>
              <TableCell>
                <Link
                  href={`/platform-admin/organizations/${organization.id}`}
                  className="font-medium text-tenderos-navy hover:underline"
                >
                  {organization.name}
                </Link>
              </TableCell>
              <TableCell className="text-tenderos-slate">{organization.slug}</TableCell>
              <TableCell>
                <Badge tone={ORGANIZATION_STATUS_TONE[organization.status] ?? "success"}>{organization.status}</Badge>
              </TableCell>
              <TableCell>{organization.activeMemberCount}</TableCell>
              <TableCell className="text-tenderos-slate">
                {new Date(organization.createdAt).toLocaleDateString("fr-FR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Button
          variant="link"
          href={`/platform-admin/organizations?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}
          className="self-start"
        >
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
