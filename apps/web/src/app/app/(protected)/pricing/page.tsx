import type { Metadata } from "next";
import { appApiFetch } from "../../../../lib/app-api-client";
import type { OrganizationCostSummary } from "../../../../lib/pricing-types";
import { ApiErrorState } from "../api-error-state";
import { OrganizationPricingSection } from "./organization-pricing-section";

export const metadata: Metadata = { title: "Coûts IA — TenderOS" };

export default async function OrganizationPricingPage() {
  let summary: OrganizationCostSummary;
  try {
    summary = await appApiFetch<OrganizationCostSummary>("/api/v1/pricing/organization/summary");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Coûts IA</h1>
        <p className="text-sm text-neutral-600">
          Coût technique IA réel agrégé par client et par type de tâche. Réservé aux propriétaires et administrateurs
          d&apos;organisation. Aucun montant affiché ici n&apos;est un prix réel garanti du marché.
        </p>
      </div>
      <OrganizationPricingSection summary={summary} />
    </div>
  );
}
