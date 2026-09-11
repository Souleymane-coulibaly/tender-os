import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { appApiFetch } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { fetchCandidateCompanies } from "../../../candidate-company-actions";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { ApiErrorState } from "../../api-error-state";
import { CreateOpportunityForm } from "./create-opportunity-form";

export const metadata: Metadata = { title: "Nouvelle opportunité — TenderOS" };

export default async function NewOpportunityPage() {
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  let candidateCompanies: CandidateCompanySummary[];
  try {
    [clients, candidateCompanies] = await Promise.all([
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE"),
      fetchCandidateCompanies().then((page) => page.items),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Opportunités", href: "/app/opportunities" }, { label: "Nouvelle" }]}
        title="Nouvelle opportunité"
        description="Une opportunité peut être créée sans client ni entreprise candidate rattachés — le score et la décision restent possibles, avec confiance réduite tant qu'aucun candidat n'est résolu."
      />
      <CreateOpportunityForm clients={clients.items} candidateCompanies={candidateCompanies} />
    </div>
  );
}
