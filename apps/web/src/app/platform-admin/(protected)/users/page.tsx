import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
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
import type { PageResponse, PlatformUser } from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Utilisateurs — Platform Admin — TenderOS" };

const STATUS_FILTERS = ["ALL", "SUSPENDED", "DEACTIVATED"] as const;

/** Ton `Badge` d'un statut d'utilisateur (remplace l'ancien `statusBadgeClass()` local). */
const USER_STATUS_TONE: Record<PlatformUser["status"], BadgeTone> = {
  INVITED: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  DEACTIVATED: "danger",
};

export default async function PlatformAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const { status, cursor } = await searchParams;
  const activeStatus = STATUS_FILTERS.includes(status as (typeof STATUS_FILTERS)[number])
    ? (status as (typeof STATUS_FILTERS)[number])
    : "ALL";

  const params = new URLSearchParams({ limit: "25" });
  if (activeStatus !== "ALL") {
    params.set("status", activeStatus);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  let page: PageResponse<PlatformUser>;

  try {
    page = await platformApiFetch<PageResponse<PlatformUser>>(`/api/v1/admin/users?${params.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Back-office", href: "/platform-admin" }, { label: "Utilisateurs" }]} title="Utilisateurs" />
      <Card padding="tight">
        <nav className="flex flex-wrap gap-2 text-sm">
          {STATUS_FILTERS.map((filter) => (
            <Link
              key={filter}
              href={filter === "ALL" ? "/platform-admin/users" : `/platform-admin/users?status=${filter}`}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                activeStatus === filter
                  ? "bg-tenderos-navy text-white"
                  : "border border-tenderos-navy/15 text-tenderos-navy hover:bg-tenderos-light"
              }`}
            >
              {filter === "ALL" ? "Tous" : filter === "SUSPENDED" ? "Suspendus" : "Désactivés"}
            </Link>
          ))}
        </nav>
      </Card>

      {page.items.length === 0 ? (
        <EmptyState title="Aucun utilisateur à afficher pour ce filtre." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nom</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Créé le</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell className="text-tenderos-slate">{user.email}</TableCell>
                <TableCell>
                  <Badge tone={USER_STATUS_TONE[user.status] ?? "success"}>{user.status}</Badge>
                </TableCell>
                <TableCell className="text-tenderos-slate">{new Date(user.createdAt).toLocaleDateString("fr-FR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Button
          variant="link"
          href={`/platform-admin/users?${new URLSearchParams({
            ...(activeStatus !== "ALL" ? { status: activeStatus } : {}),
            cursor: page.pageInfo.nextCursor,
          }).toString()}`}
          className="self-start"
        >
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
