import type { Metadata } from "next";
import { platformApiFetch } from "../../../lib/platform-api-client";
import type { PlatformMetrics } from "../../../lib/platform-admin-types";
import { ApiErrorState } from "./api-error-state";

export const metadata: Metadata = { title: "Tableau de bord — Platform Admin — TenderOS" };

function MetricGroup({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className="rounded border border-neutral-200 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <dl className="flex flex-col gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <dt className="text-neutral-600">{status}</dt>
            <dd className="font-medium">{count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function PlatformAdminDashboardPage() {
  let metrics: PlatformMetrics;

  try {
    metrics = await platformApiFetch<PlatformMetrics>("/api/v1/admin/metrics");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Tableau de bord</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricGroup title="Organisations" counts={metrics.organizationsByStatus} />
        <MetricGroup title="Utilisateurs" counts={metrics.usersByStatus} />
        <MetricGroup title="Administrateurs plateforme" counts={metrics.platformAdministratorsByRole} />
      </div>
    </div>
  );
}
