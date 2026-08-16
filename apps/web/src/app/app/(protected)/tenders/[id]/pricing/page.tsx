import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { PricingEstimateSummary, TenderCostSummary } from "../../../../../../lib/pricing-types";
import { Card } from "../../../../../../components/ui/card";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { EstimateHistorySection } from "./estimate-history-section";
import { PricingSection } from "./pricing-section";

export const metadata: Metadata = { title: "Pricing — TenderOS" };

export default async function TenderPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let summary: TenderCostSummary;
  let actorRole: string | undefined;
  let history: { items: PricingEstimateSummary[]; total: number };
  try {
    [summary, actorRole, history] = await Promise.all([
      appApiFetch<TenderCostSummary>(`/api/v1/tenders/${tenderId}/pricing/summary`),
      getCurrentMembershipRole(),
      appApiFetch<{ items: PricingEstimateSummary[]; total: number }>(
        `/api/v1/tenders/${tenderId}/pricing/estimates?includeArchived=true&limit=50&offset=0`,
      ),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Pricing" }]}
        title="Pricing & prévisions"
        description="Coût technique IA réel de ce Tender et estimations prévisionnelles indicatives. Aucun montant affiché ici n'est un prix réel garanti du marché."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/pricing`} />
      <PricingSection tenderId={tenderId} initialSummary={summary} actorRole={actorRole} />

      <Card title="Historique des estimations">
        <EstimateHistorySection estimates={history.items} />
      </Card>
    </div>
  );
}
