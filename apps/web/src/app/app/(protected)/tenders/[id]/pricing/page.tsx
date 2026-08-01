import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { PricingEstimateSummary, TenderCostSummary } from "../../../../../../lib/pricing-types";
import { ApiErrorState } from "../../../api-error-state";
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
      <div>
        <h1 className="text-xl font-semibold">Pricing &amp; prévisions</h1>
        <p className="text-sm text-neutral-600">
          Coût technique IA réel de ce Tender et estimations prévisionnelles indicatives. Aucun montant affiché ici
          n&apos;est un prix réel garanti du marché.
        </p>
      </div>
      <PricingSection tenderId={tenderId} initialSummary={summary} actorRole={actorRole} />

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Historique des estimations</h2>
        <EstimateHistorySection estimates={history.items} />
      </section>
    </div>
  );
}
