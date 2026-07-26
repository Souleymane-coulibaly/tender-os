import type { Metadata } from "next";
import Link from "next/link";
import { platformApiFetch } from "../../../../lib/platform-api-client";
import type { PageResponse, PlatformAuditLogEntry } from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Audit — Platform Admin — TenderOS" };

export default async function PlatformAdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=25` : "?limit=25";

  let page: PageResponse<PlatformAuditLogEntry>;

  try {
    page = await platformApiFetch<PageResponse<PlatformAuditLogEntry>>(`/api/v1/admin/audit-logs${query}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (page.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Journal d&apos;audit</h1>
        <p className="text-sm text-neutral-600">Aucun événement à afficher.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Journal d&apos;audit</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Organisation</th>
            <th className="py-2 pr-4">Acteur</th>
            <th className="py-2 pr-4">Résultat</th>
            <th className="py-2 pr-4">Date</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((entry) => (
            <tr key={entry.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
              <td className="py-2 pr-4 text-neutral-600">
                <Link href={`/platform-admin/organizations/${entry.organizationId}`} className="hover:underline">
                  {entry.organizationId}
                </Link>
              </td>
              <td className="py-2 pr-4 text-neutral-600">{entry.actorId ?? "—"}</td>
              <td className="py-2 pr-4">{entry.result}</td>
              <td className="py-2 pr-4 text-neutral-600">{new Date(entry.createdAt).toLocaleString("fr-FR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Link
          href={`/platform-admin/audit-logs?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
