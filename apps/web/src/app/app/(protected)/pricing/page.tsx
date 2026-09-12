import type { Metadata } from "next";
import { PageHeader } from "../../../../components/ui";
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
      <PageHeader
        guideKey="ai-costs"
        breadcrumb={[{ label: "Coûts IA" }]}
        title="Coûts IA"
        description="Coût technique IA réel agrégé par client et par type de tâche. Réservé aux propriétaires et administrateurs d'organisation. Aucun montant affiché ici n'est un prix réel garanti du marché."
      />
      <OrganizationPricingSection summary={summary} />
    </div>
  );
}
