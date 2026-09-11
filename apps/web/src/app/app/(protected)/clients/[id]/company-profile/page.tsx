import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../../../../../../components/ui";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { CompanyProfileSummary } from "../../../../../../lib/company-profile-types";
import type { ClientAccountSummary } from "../../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../../api-error-state";
import { CompanyProfileTabs } from "./company-profile-tabs";

export const metadata: Metadata = { title: "Profil entreprise du client — TenderOS" };

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let client: ClientAccountSummary;
  let profile: CompanyProfileSummary;
  try {
    [client, profile] = await Promise.all([
      appApiFetch<ClientAccountSummary>(`/api/v1/clients/${id}`),
      appApiFetch<CompanyProfileSummary>(`/api/v1/clients/${id}/profile`),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Clients", href: "/app/clients" },
          { label: client.name, href: `/app/clients/${id}` },
          { label: "Profil entreprise" },
        ]}
        title="Profil entreprise du client"
        description={
          <>
            Identité légale, contacts, comptes bancaires, assurances, certifications, références et moyens de ce client — distinct de la fiche{" "}
            <Link href="/app/candidate-companies" className="underline hover:text-tenderos-navy">
              Entreprise candidate
            </Link>
            , qui porte l&apos;entité juridique répondant effectivement à vos appels d&apos;offres.
          </>
        }
      />

      <CompanyProfileTabs clientId={id} profile={profile} />
    </div>
  );
}
