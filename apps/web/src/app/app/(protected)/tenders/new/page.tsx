import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import type { Buyer } from "../../../../../lib/tenders-types";
import type { CandidateCompanyPage } from "../../../../../lib/candidate-company-types";
import { ApiErrorState } from "../../api-error-state";
import { CreateTenderForm } from "./create-tender-form";

export const metadata: Metadata = { title: "Nouvel appel d'offres — TenderOS" };

const BREADCRUMB = [{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Nouveau" }];

export default async function NewTenderPage() {
  // Mission Sprint 5.1 §"Tenders" — jamais un client archivé sélectionnable pour une nouvelle
  // création : le paramètre par défaut `includeArchived=false` de /clients l'exclut déjà.
  let clients: ClientPortfolioPage<ClientAccountSummary>;
  let buyers: Buyer[];
  // Checkpoint CCV2-G.1 — la liste est bornée à l'organisation courante par l'API elle-même
  // (`X-Organization-Id`), jamais filtrée côté interface. Les entreprises archivées sont exclues
  // par le défaut de la route (`includeArchived` absent).
  let candidateCompanies: CandidateCompanyPage;
  try {
    [clients, buyers, candidateCompanies] = await Promise.all([
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE"),
      appApiFetch<Buyer[]>("/api/v1/buyers"),
      appApiFetch<CandidateCompanyPage>("/api/v1/candidate-companies?limit=100"),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  if (clients.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={BREADCRUMB} title="Nouvel appel d'offres" />
        <Card>
          <p className="text-sm text-tenderos-slate">
            Aucun client accessible. Un appel d&apos;offres doit obligatoirement être rattaché à un client —{" "}
            <Link href="/app/clients/new" className="font-medium text-tenderos-blue underline">
              créez d&apos;abord un client
            </Link>{" "}
            ou demandez à être affecté à un client existant.
          </p>
        </Card>
      </div>
    );
  }

  // Checkpoint CCV2-G.1 — sans entreprise candidate, la création est structurellement impossible :
  // on le dit AVANT le formulaire plutôt que de laisser l'utilisateur le remplir pour échouer au
  // dernier champ. Même discipline que le garde-fou « aucun client accessible » ci-dessus.
  if (candidateCompanies.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={BREADCRUMB} title="Nouvel appel d'offres" />
        <Card>
          <p className="text-sm text-tenderos-slate">
            Aucune entreprise candidate. Un appel d&apos;offres doit désormais désigner explicitement
            l&apos;entité juridique qui y répond —{" "}
            <Link href="/app/candidate-companies/new" className="font-medium text-tenderos-blue underline">
              créez d&apos;abord une entreprise candidate
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={BREADCRUMB} title="Nouvel appel d'offres" />
      <Card>
        <CreateTenderForm clients={clients.items} buyers={buyers} candidateCompanies={candidateCompanies.items} />
      </Card>
    </div>
  );
}
