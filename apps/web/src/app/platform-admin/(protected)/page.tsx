import type { Metadata } from "next";
import { Card, PageHeader } from "../../../components/ui";
import { platformApiFetch } from "../../../lib/platform-api-client";
import type { PlatformMetrics } from "../../../lib/platform-admin-types";
import { ApiErrorState } from "./api-error-state";

export const metadata: Metadata = { title: "Tableau de bord — Platform Admin — TenderOS" };

function MetricGroup({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <Card title={title}>
      <dl className="flex flex-col gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <dt className="text-tenderos-slate">{status}</dt>
            <dd className="font-semibold text-tenderos-navy">{count}</dd>
          </div>
        ))}
      </dl>
    </Card>
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
      <PageHeader breadcrumb={[{ label: "Back-office", href: "/platform-admin" }, { label: "Tableau de bord" }]} title="Tableau de bord" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricGroup title="Organisations" counts={metrics.organizationsByStatus} />
        <MetricGroup title="Utilisateurs" counts={metrics.usersByStatus} />
        <MetricGroup title="Administrateurs plateforme" counts={metrics.platformAdministratorsByRole} />
      </div>
    </div>
  );
}
