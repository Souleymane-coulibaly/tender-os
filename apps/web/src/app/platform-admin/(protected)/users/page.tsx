import type { Metadata } from "next";
import Link from "next/link";
import { platformApiFetch } from "../../../../lib/platform-api-client";
import type { PageResponse, PlatformUser } from "../../../../lib/platform-admin-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Utilisateurs — Platform Admin — TenderOS" };

const STATUS_FILTERS = ["ALL", "SUSPENDED", "DEACTIVATED"] as const;

function statusBadgeClass(status: PlatformUser["status"]): string {
  switch (status) {
    case "SUSPENDED":
    case "DEACTIVATED":
      return "bg-red-100 text-red-800";
    case "INVITED":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-green-100 text-green-800";
  }
}

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
      <h1 className="text-xl font-semibold">Utilisateurs</h1>
      <nav className="flex gap-2 text-sm">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === "ALL" ? "/platform-admin/users" : `/platform-admin/users?status=${filter}`}
            className={`rounded px-3 py-1 ${
              activeStatus === filter ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {filter === "ALL" ? "Tous" : filter === "SUSPENDED" ? "Suspendus" : "Désactivés"}
          </Link>
        ))}
      </nav>

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun utilisateur à afficher pour ce filtre.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 pr-4">Nom</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Statut</th>
              <th className="py-2 pr-4">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((user) => (
              <tr key={user.id} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-medium">{user.displayName}</td>
                <td className="py-2 pr-4 text-neutral-600">{user.email}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(user.status)}`}>
                    {user.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-neutral-600">{new Date(user.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Link
          href={`/platform-admin/users?${new URLSearchParams({
            ...(activeStatus !== "ALL" ? { status: activeStatus } : {}),
            cursor: page.pageInfo.nextCursor,
          }).toString()}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
