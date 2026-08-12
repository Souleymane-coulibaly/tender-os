import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../lib/client-portfolio-types";
import type { DashboardOverview } from "../../../lib/dashboard-types";
import { fetchDashboard } from "../dashboard-actions";
import { ApiErrorState } from "./api-error-state";
import { DashboardFilters } from "./dashboard-filters";
import { ActivityWidget, AttentionWidget, DeadlinesWidget, GoNoGoWidget, KpiCard, MyTasksWidget, PackagesWidget, PipelineWidget } from "./dashboard-widgets";

export const metadata: Metadata = { title: "Tableau de bord — TenderOS" };

type SearchParams = { clientId?: string; periodDays?: string };

const VALID_PERIODS = new Set(["7", "30", "90"]);

function sevenDaysFrom(isoDate: string): string {
  return new Date(new Date(isoDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const periodDays = VALID_PERIODS.has(params.periodDays ?? "") ? (Number(params.periodDays) as 7 | 30 | 90) : 30;

  let currentUser: { displayName: string };
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  let overview: DashboardOverview;
  try {
    [currentUser, clients, overview] = await Promise.all([
      appApiFetch<{ displayName: string }>("/api/v1/auth/me"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100"),
      fetchDashboard({ clientId: params.clientId, periodDays }),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const firstName = currentUser.displayName.split(" ")[0] ?? currentUser.displayName;
  const hasAttention = overview.kpis.needingAttention > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Bonjour {firstName}</h1>
          <p className="text-sm text-neutral-600">
            {hasAttention
              ? `${overview.kpis.needingAttention} dossier(s) nécessitent votre attention.`
              : "Tous vos dossiers sont à jour."}
          </p>
        </div>
        <DashboardFilters values={{ clientId: params.clientId, periodDays: String(periodDays) }} clients={clients.items} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Actifs" value={overview.kpis.activeTenders} href="/app/tenders" />
        <KpiCard
          label="Échéances ≤ 7j"
          value={overview.kpis.deadlinesNext7Days}
          tone={overview.kpis.deadlinesNext7Days > 0 ? "warning" : undefined}
          href={`/app/tenders?deadlineAfter=${encodeURIComponent(overview.generatedAt)}&deadlineBefore=${encodeURIComponent(sevenDaysFrom(overview.generatedAt))}`}
        />
        <KpiCard label="En retard" value={overview.kpis.overdueTenders} tone={overview.kpis.overdueTenders > 0 ? "critical" : undefined} href="/app/tenders?overdue=true" />
        <KpiCard label="Prêts à déposer" value={overview.kpis.readyToSubmit} tone="good" href="/app/tenders?status=READY_TO_SUBMIT" />
        <KpiCard label="Packages prêts" value={overview.kpis.packagesReady} tone="good" />
        <KpiCard label="À traiter" value={overview.kpis.needingAttention} tone={overview.kpis.needingAttention > 0 ? "critical" : undefined} href="#attention" />
        <KpiCard label="Validations en attente" value={overview.kpis.pendingApprovals} tone={overview.kpis.pendingApprovals > 0 ? "warning" : undefined} href="/app/validations" />
      </div>

      {overview.kpis.activeTenders === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm font-medium text-neutral-800">Aucun appel d&apos;offres actif.</p>
          <p className="mt-1 text-sm text-neutral-500">Ajoutez ou recherchez un appel d&apos;offres pour démarrer.</p>
          <Link href="/app/tenders" className="mt-3 inline-block rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
            Voir les appels d&apos;offres
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="order-1 lg:order-4">
            <AttentionWidget items={overview.attentionItems} />
          </div>
          <div className="order-2 lg:order-2">
            <DeadlinesWidget deadlines={overview.deadlines} />
          </div>
          <div className="order-3 lg:order-6">
            <MyTasksWidget tasks={overview.myTasks} />
          </div>
          <div className="order-4 lg:order-1">
            <PipelineWidget pipeline={overview.pipeline} />
          </div>
          <div className="order-5 lg:order-3">
            <PackagesWidget packages={overview.packages} />
          </div>
          <div className="order-6 lg:order-5">
            <GoNoGoWidget goNoGo={overview.goNoGo} />
          </div>
          <div className="order-7 lg:col-span-2 lg:order-7">
            <ActivityWidget activity={overview.activity} />
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-400">Dernière mise à jour : {new Date(overview.generatedAt).toLocaleTimeString("fr-FR")}</p>
    </div>
  );
}
