import type { Metadata } from "next";
import { appApiFetch } from "../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../lib/client-portfolio-types";
import type { DashboardOverview } from "../../../lib/dashboard-types";
import type { OrganizationEntitlementsDto, OrganizationSubscriptionDto, OrganizationUsageDto, PassPurchaseDto } from "../../../lib/billing-types";
import { getCurrentMembershipRole } from "../../../lib/app-api-client";
import { fetchAoCreditBalance, fetchEntitlements, fetchPassPurchases, fetchSubscription, fetchUsage } from "../billing-actions";
import { fetchDashboard } from "../dashboard-actions";
import { ActivationChecklistWidget } from "./activation-checklist-widget";
import { ApiErrorState } from "./api-error-state";
import { DashboardFilters } from "./dashboard-filters";
import { DashboardHeader } from "./dashboard-header";
import { DashboardKpiRow } from "./dashboard-kpi-row";
import { ActivityWidget, DeadlinesWidget } from "./dashboard-widgets";
import { MarketWatchWidget } from "./market-watch-widget";
import { PriorityTendersWidget } from "./priority-tenders-widget";
import { QuickActionsPanel } from "./quick-actions-panel";
import { TrialConversionTracker } from "./trial-conversion-tracker";
import { UsageWidget } from "./usage-widget";
import { WelcomeTourPrompt } from "./welcome-tour-prompt";

type BillingSummaryData = {
  subscription: OrganizationSubscriptionDto | null;
  entitlements: OrganizationEntitlementsDto;
  usage: OrganizationUsageDto;
  aoCreditBalance: number;
  passPurchases: PassPurchaseDto[];
};

/** Mission §52 — jamais bloquant pour le reste du Dashboard (même motif que la cloche de
 *  notifications dans le layout) : une organisation sans facturation configurée, ou une erreur
 *  ponctuelle de l'API billing, ne doit jamais faire échouer la page entière. */
async function fetchBillingSummary(): Promise<BillingSummaryData | null> {
  try {
    const [subscription, entitlements, usage, aoCreditBalance, passPurchasesPage] = await Promise.all([
      fetchSubscription(),
      fetchEntitlements(),
      fetchUsage(),
      fetchAoCreditBalance(),
      fetchPassPurchases(),
    ]);
    return { subscription, entitlements, usage, aoCreditBalance, passPurchases: passPurchasesPage.items };
  } catch {
    return null;
  }
}

export const metadata: Metadata = { title: "Tableau de bord — TenderOS" };

type SearchParams = { clientId?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let currentUser: { displayName: string };
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  let overview: DashboardOverview;
  let billingSummary: BillingSummaryData | null;
  let actorRole: string | undefined;
  try {
    [currentUser, clients, overview, billingSummary, actorRole] = await Promise.all([
      appApiFetch<{ displayName: string }>("/api/v1/auth/me"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100"),
      fetchDashboard({ clientId: params.clientId }),
      fetchBillingSummary(),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const firstName = currentUser.displayName.split(" ")[0] ?? currentUser.displayName;
  const isFirstRun = overview.kpis.activeTenders === 0 && overview.attentionItems.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <TrialConversionTracker subscriptionStatus={billingSummary?.subscription?.status ?? null} />
      <WelcomeTourPrompt />

      <DashboardHeader firstName={firstName} subscription={billingSummary?.subscription ?? null} actorRole={actorRole} />

      {clients.items.length > 0 ? <DashboardFilters values={{ clientId: params.clientId }} clients={clients.items} /> : null}

      <DashboardKpiRow
        activeTenders={overview.kpis.activeTenders}
        deadlinesNext7Days={overview.kpis.deadlinesNext7Days}
        pendingApprovals={overview.kpis.pendingApprovals}
        relevantOpportunitiesCount={overview.marketWatch.relevantOpportunitiesCount}
      />

      <ActivationChecklistWidget checklist={overview.activationChecklist} />

      {/* V2 Sprint 25 — mission §25.68 "First Run Experience" : copie exacte mission, jamais un
          simple mur de zéros pour une organisation cliente sans dossier. */}
      {isFirstRun ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-tenderos-navy/10 bg-tenderos-light/50 p-10 text-center">
          <p className="font-tenderos-display text-lg font-bold text-tenderos-navy">Bienvenue dans TenderOS</p>
          <p className="text-sm text-tenderos-slate">Votre espace est prêt. Préparons votre première réponse.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <PriorityTendersWidget items={overview.attentionItems} />
        <DeadlinesWidget deadlines={overview.deadlines} />
        {billingSummary ? (
          <UsageWidget subscription={billingSummary.subscription} entitlements={billingSummary.entitlements} usage={billingSummary.usage} aoCreditBalance={billingSummary.aoCreditBalance} />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MarketWatchWidget marketWatch={overview.marketWatch} />
        <ActivityWidget activity={overview.activity} />
        <QuickActionsPanel actorRole={actorRole} />
      </div>

      <p className="text-xs text-tenderos-slate">Dernière mise à jour : {new Date(overview.generatedAt).toLocaleTimeString("fr-FR")}</p>
    </div>
  );
}
