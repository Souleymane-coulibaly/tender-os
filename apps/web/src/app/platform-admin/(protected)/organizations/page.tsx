import type { Metadata } from "next";
import Link from "next/link";
import { platformApiFetch } from "../../../../lib/platform-api-client";
import type { PageResponse, PlatformOrganization } from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Organisations — Platform Admin — TenderOS" };

function statusBadgeClass(status: PlatformOrganization["status"]): string {
  switch (status) {
    case "SUSPENDED":
      return "bg-red-100 text-red-800";
    case "CLOSED":
      return "bg-neutral-200 text-neutral-700";
    case "TRIAL":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-green-100 text-green-800";
  }
}

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
        <h1 className="text-xl font-semibold">Organisations</h1>
        <p className="text-sm text-neutral-600">Aucune organisation à afficher.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Organisations</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">Statut</th>
            <th className="py-2 pr-4">Membres actifs</th>
            <th className="py-2 pr-4">Créée le</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((organization) => (
            <tr key={organization.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4">
                <Link
                  href={`/platform-admin/organizations/${organization.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {organization.name}
                </Link>
              </td>
              <td className="py-2 pr-4 text-neutral-600">{organization.slug}</td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(organization.status)}`}>
                  {organization.status}
                </span>
              </td>
              <td className="py-2 pr-4">{organization.activeMemberCount}</td>
              <td className="py-2 pr-4 text-neutral-600">
                {new Date(organization.createdAt).toLocaleDateString("fr-FR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Link
          href={`/platform-admin/organizations?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
