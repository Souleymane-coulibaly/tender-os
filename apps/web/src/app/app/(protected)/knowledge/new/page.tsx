import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
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
      <PageHeader
        breadcrumb={[{ label: "Base de connaissances", href: "/app/knowledge" }, { label: "Nouvelle entrée" }]}
        title="Nouvelle entrée"
      />
      <CreateKnowledgeEntryForm clients={clients.items} />
    </div>
  );
}
