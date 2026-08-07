import type { Metadata } from "next";
import { appApiFetch } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../api-error-state";
import { CreateOpportunityForm } from "./create-opportunity-form";

export const metadata: Metadata = { title: "Nouvelle opportunité — TenderOS" };

export default async function NewOpportunityPage() {
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  try {
    clients = await appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Nouvelle opportunité</h1>
        <p className="text-sm text-neutral-600">
          Une opportunité peut être créée sans entreprise candidate rattachée — le score et la décision restent possibles, avec confiance réduite tant qu&apos;aucun candidat n&apos;est résolu.
        </p>
      </div>
      <CreateOpportunityForm clients={clients.items} />
    </div>
  );
}
