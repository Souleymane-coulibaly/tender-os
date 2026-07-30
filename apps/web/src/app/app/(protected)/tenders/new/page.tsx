import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../api-error-state";
import { CreateTenderForm } from "./create-tender-form";

export const metadata: Metadata = { title: "Nouvel appel d'offres — TenderOS" };

export default async function NewTenderPage() {
  // Mission Sprint 5.1 §"Tenders" — jamais un client archivé sélectionnable pour une nouvelle
  // création : le paramètre par défaut `includeArchived=false` de /clients l'exclut déjà.
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  try {
    clients = await appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (clients.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Nouvel appel d&apos;offres</h1>
        <p className="text-sm text-neutral-600">
          Aucun client accessible. Un appel d&apos;offres doit obligatoirement être rattaché à un client —{" "}
          <Link href="/app/clients/new" className="text-neutral-900 underline">
            créez d&apos;abord un client
          </Link>{" "}
          ou demandez à être affecté à un client existant.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvel appel d&apos;offres</h1>
      <CreateTenderForm clients={clients.items} />
    </div>
  );
}
