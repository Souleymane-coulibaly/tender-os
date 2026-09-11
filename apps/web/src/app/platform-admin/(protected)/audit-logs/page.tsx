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
import {
  PLATFORM_AUDIT_RESULT_LABELS,
  type PageResponse,
  type PlatformAuditLogEntry,
} from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Audit — Platform Admin — TenderOS" };

/** Ton `Badge` d'un résultat journalisé — un résultat inconnu reste affiché tel quel, en neutre. */
const AUDIT_RESULT_TONE: Record<string, BadgeTone> = {
  SUCCESS: "success",
  FAILURE: "danger",
  DENIED: "warning",
};

const BREADCRUMB = [{ label: "Back-office", href: "/platform-admin" }, { label: "Audit" }];

export default async function PlatformAdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=25` : "?limit=25";

  let page: PageResponse<PlatformAuditLogEntry>;

  try {
    page = await platformApiFetch<PageResponse<PlatformAuditLogEntry>>(
      `/api/v1/admin/audit-logs${query}`,
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (page.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={BREADCRUMB} title="Journal d'audit" />
        <EmptyState title="Aucun événement à afficher." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={BREADCRUMB} title="Journal d'audit" />
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Action</TableHeaderCell>
            <TableHeaderCell>Organisation</TableHeaderCell>
            <TableHeaderCell>Acteur</TableHeaderCell>
            <TableHeaderCell>Résultat</TableHeaderCell>
            <TableHeaderCell>Date</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {page.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-mono text-xs">{entry.action}</TableCell>
              <TableCell className="text-tenderos-slate">
                <Link
                  href={`/platform-admin/organizations/${entry.organizationId}`}
                  className="hover:underline"
                >
                  {entry.organizationId}
                </Link>
              </TableCell>
              <TableCell className="text-tenderos-slate">{entry.actorId ?? "—"}</TableCell>
              <TableCell>
                <Badge tone={AUDIT_RESULT_TONE[entry.result] ?? "neutral"}>
                  {PLATFORM_AUDIT_RESULT_LABELS[entry.result] ?? entry.result}
                </Badge>
              </TableCell>
              <TableCell className="text-tenderos-slate">
                {new Date(entry.createdAt).toLocaleString("fr-FR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Button
          variant="link"
          href={`/platform-admin/audit-logs?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}
          className="self-start"
        >
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
