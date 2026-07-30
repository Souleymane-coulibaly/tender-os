import type { Metadata } from "next";
import { appApiFetch } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../api-error-state";
import { CreateKnowledgeEntryForm } from "./create-knowledge-entry-form";

export const metadata: Metadata = { title: "Nouvelle entrée — Base de connaissances — TenderOS" };

export default async function NewKnowledgeEntryPage() {
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  try {
    clients = await appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvelle entrée</h1>
      <CreateKnowledgeEntryForm clients={clients.items} />
    </div>
  );
}
